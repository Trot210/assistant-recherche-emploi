"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { OffreAvecDetails } from "@/types/dashboard";
import {
  estParisIntraMuros,
  libelleSource,
  categorieContrat,
  estStageOuAlternance,
  type CategorieContrat,
} from "@/lib/dashboard-utils";
import OfferCard from "./OfferCard";
import OfferPanel from "./OfferPanel";
import Tracker from "./Tracker";
import AddOfferModal from "./AddOfferModal";

interface Props {
  offres: OffreAvecDetails[];
  userEmail: string;
}

type ActionEnCours = { offreId: string; type: "cv" | "lm" | "message" | "score" } | null;
type Tri = "score-desc" | "score-asc" | "date-desc";
type FiltreLocalisation = "Toutes" | "Paris" | "IDF";

export default function Dashboard({ offres, userEmail }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [recherche, setRecherche] = useState("");
  const [source, setSource] = useState("Toutes");
  const [contrat, setContrat] = useState<CategorieContrat | "Toutes">("Toutes");
  const [tri, setTri] = useState<Tri>("score-desc");
  const [localisationFiltre, setLocalisationFiltre] = useState<FiltreLocalisation>("Toutes");
  const [offreSelectionneeId, setOffreSelectionneeId] = useState<string | null>(null);
  const [modalAjoutOuvert, setModalAjoutOuvert] = useState(false);
  const [actionEnCours, setActionEnCours] = useState<ActionEnCours>(null);
  const [syncEnCours, setSyncEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avertissements, setAvertissements] = useState<string[]>([]);

  const sourcesDisponibles = useMemo(() => {
    const set = new Set(offres.map((o) => o.source));
    return ["Toutes", ...Array.from(set)];
  }, [offres]);

  // Stages et alternances sont exclus par défaut des résultats et des
  // statistiques (système de recommandation) — sélectionner explicitement
  // le filtre "Alternance" ou "Stage" les fait réapparaître.
  const offresPertinentes = useMemo(() => offres.filter((o) => !estStageOuAlternance(o)), [offres]);

  const offresFiltrees = useMemo(() => {
    let liste = offres.filter((o) => {
      const texte = `${o.titre} ${o.entreprise ?? ""}`.toLowerCase();
      const matchRecherche = texte.includes(recherche.toLowerCase());
      const matchSource = source === "Toutes" || o.source === source;
      const matchContrat =
        contrat === "Toutes" ? !estStageOuAlternance(o) : categorieContrat(o) === contrat;
      const matchLocalisation =
        localisationFiltre === "Toutes" ||
        (localisationFiltre === "Paris"
          ? estParisIntraMuros(o.localisation)
          : !estParisIntraMuros(o.localisation));
      return matchRecherche && matchSource && matchContrat && matchLocalisation;
    });
    liste = [...liste].sort((a, b) => {
      if (tri === "score-desc") return (b.score?.score ?? -1) - (a.score?.score ?? -1);
      if (tri === "score-asc") return (a.score?.score ?? 999) - (b.score?.score ?? 999);
      return (b.date_publication ?? "").localeCompare(a.date_publication ?? "");
    });
    return liste;
  }, [offres, recherche, source, contrat, tri, localisationFiltre]);

  const stats = useMemo(() => {
    const total = offresPertinentes.length;
    const fortes = offresPertinentes.filter((o) => (o.score?.score ?? 0) >= 80).length;
    const scores = offresPertinentes
      .map((o) => o.score?.score)
      .filter((s): s is number => s != null);
    const moyenne =
      scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const documentsPrets = offresPertinentes.filter(
      (o) => o.candidature?.cv_genere_url || o.candidature?.lm_generee_url,
    ).length;
    return { total, fortes, moyenne, documentsPrets };
  }, [offresPertinentes]);

  const offreSelectionnee = offres.find((o) => o.id === offreSelectionneeId) ?? null;

  function rafraichir() {
    startTransition(() => router.refresh());
  }

  async function appelerApi(url: string, body: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Une erreur est survenue");
    return data;
  }

  async function genererCv(offreId: string) {
    setErreur(null);
    setAvertissements([]);
    setActionEnCours({ offreId, type: "cv" });
    try {
      const data = await appelerApi("/api/documents/cv", { offre_id: offreId });
      setAvertissements(data.avertissements ?? []);
      rafraichir();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de la génération du CV");
    } finally {
      setActionEnCours(null);
    }
  }

  async function genererLettre(offreId: string) {
    setErreur(null);
    setAvertissements([]);
    setActionEnCours({ offreId, type: "lm" });
    try {
      const data = await appelerApi("/api/documents/lettre", { offre_id: offreId });
      setAvertissements(data.avertissements ?? []);
      rafraichir();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de la génération de la lettre");
    } finally {
      setActionEnCours(null);
    }
  }

  async function genererMessage(offreId: string) {
    setErreur(null);
    setAvertissements([]);
    setActionEnCours({ offreId, type: "message" });
    try {
      const data = await appelerApi("/api/documents/message", { offre_id: offreId });
      setAvertissements(data.avertissements ?? []);
      rafraichir();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de la génération du message");
    } finally {
      setActionEnCours(null);
    }
  }

  async function noterOffre(offreId: string) {
    setErreur(null);
    setActionEnCours({ offreId, type: "score" });
    try {
      await appelerApi("/api/scoring", { offre_id: offreId });
      rafraichir();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors du scoring");
    } finally {
      setActionEnCours(null);
    }
  }

  async function marquerStatut(offreId: string, statut: "envoyee" | "a_traiter") {
    setErreur(null);
    try {
      const res = await fetch("/api/candidatures", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offre_id: offreId, statut }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      rafraichir();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de la mise à jour");
    }
  }

  async function synchroniser() {
    setErreur(null);
    setSyncEnCours(true);
    try {
      await appelerApi("/api/offres/sync", {});
      rafraichir();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de la synchronisation");
    } finally {
      setSyncEnCours(false);
    }
  }

  async function deconnexion() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const candidaturesEnvoyees = offres.filter((o) => o.candidature?.statut === "envoyee");

  return (
    <div className="wrap">
      <div className="top-row">
        <div>
          <p className="eyebrow">
            {userEmail} · Cycle de candidatures{isPending ? " · actualisation..." : ""}
          </p>
          <h1>Centre de pilotage</h1>
          <p className="sub">
            Toutes tes offres, notées et classées par compatibilité avec ton profil. Sources : France
            Travail, APEC, et ajouts manuels. Stages et alternances masqués par défaut — utilise le
            filtre type de contrat pour les afficher.
          </p>
        </div>
        <div className="top-actions">
          <button className="action-btn" onClick={() => setModalAjoutOuvert(true)}>
            + Ajouter une offre
          </button>
          <button className="action-btn primary" onClick={synchroniser} disabled={syncEnCours}>
            {syncEnCours ? "Synchronisation..." : "Synchroniser"}
          </button>
          <button className="action-btn" onClick={deconnexion}>
            Déconnexion
          </button>
        </div>
      </div>

      {erreur && (
        <p className="error-text" style={{ marginTop: 12 }}>
          {erreur}
        </p>
      )}

      <div className="stats">
        <div className="stat">
          <b>{stats.total}</b>
          <span>Offres suivies</span>
        </div>
        <div className="stat">
          <b style={{ color: "var(--emerald)" }}>{stats.fortes}</b>
          <span>Fortes correspondances</span>
        </div>
        <div className="stat">
          <b>{stats.moyenne}%</b>
          <span>Score moyen</span>
        </div>
        <div className="stat">
          <b>{stats.documentsPrets}</b>
          <span>Documents prêts</span>
        </div>
      </div>

      <div className="controls">
        <input
          className="search"
          type="text"
          placeholder="Rechercher un poste ou une entreprise…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        <select value={tri} onChange={(e) => setTri(e.target.value as Tri)}>
          <option value="score-desc">Trier : score décroissant</option>
          <option value="score-asc">Trier : score croissant</option>
          <option value="date-desc">Trier : plus récentes</option>
        </select>
        <select
          value={localisationFiltre}
          onChange={(e) => setLocalisationFiltre(e.target.value as FiltreLocalisation)}
        >
          <option value="Toutes">Localisation : toutes (IDF)</option>
          <option value="Paris">Paris intra-muros</option>
          <option value="IDF">IDF hors Paris</option>
        </select>
        <div className="chip-row">
          {sourcesDisponibles.map((s) => (
            <div
              key={s}
              className={`chip ${source === s ? "active" : ""}`}
              onClick={() => setSource(s)}
            >
              {s === "Toutes" ? "Toutes" : libelleSource(s)}
            </div>
          ))}
        </div>
        <div className="chip-row">
          {(["Toutes", "CDI", "CDD", "Alternance", "Stage", "Autre"] as const).map((c) => (
            <div
              key={c}
              className={`chip ${contrat === c ? "active" : ""}`}
              onClick={() => setContrat(c)}
            >
              {c}
            </div>
          ))}
        </div>
      </div>

      {offresFiltrees.length === 0 ? (
        <div className="empty">Aucune offre ne correspond à ces filtres.</div>
      ) : (
        <div className="grid">
          {offresFiltrees.map((offre) => (
            <OfferCard
              key={offre.id}
              offre={offre}
              chargement={actionEnCours?.offreId === offre.id ? actionEnCours.type : null}
              onOuvrir={() => {
                setOffreSelectionneeId(offre.id);
                setAvertissements([]);
              }}
              onNoter={() => noterOffre(offre.id)}
            />
          ))}
        </div>
      )}

      {offreSelectionnee && (
        <OfferPanel
          offre={offreSelectionnee}
          chargement={actionEnCours?.offreId === offreSelectionnee.id ? actionEnCours.type : null}
          avertissements={avertissements}
          onFermer={() => {
            setOffreSelectionneeId(null);
            setAvertissements([]);
          }}
          onGenererCv={() => genererCv(offreSelectionnee.id)}
          onGenererLettre={() => genererLettre(offreSelectionnee.id)}
          onGenererMessage={() => genererMessage(offreSelectionnee.id)}
          onNoter={() => noterOffre(offreSelectionnee.id)}
          onMarquerEnvoyee={() => marquerStatut(offreSelectionnee.id, "envoyee")}
        />
      )}

      <Tracker offres={candidaturesEnvoyees} onRetirer={(offreId) => marquerStatut(offreId, "a_traiter")} />

      {modalAjoutOuvert && (
        <AddOfferModal
          onFermer={() => setModalAjoutOuvert(false)}
          onAjoutee={() => {
            setModalAjoutOuvert(false);
            rafraichir();
          }}
        />
      )}
    </div>
  );
}
