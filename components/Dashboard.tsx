"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { OffreAvecDetails } from "@/types/dashboard";
import {
  estParisIntraMuros,
  libelleSource,
  categorieContrat,
  estStageOuAlternance,
  estEnvoyeeOuPlus,
  couleurFortesCorrespondances,
  couleurScoreMoyen,
  type CategorieContrat,
  type CandidatureStatut,
} from "@/lib/dashboard-utils";
import OfferCard from "./OfferCard";
import OfferPanel from "./OfferPanel";
import CandidatureTrackerModal from "./CandidatureTrackerModal";
import AddOfferModal from "./AddOfferModal";

interface Props {
  offres: OffreAvecDetails[];
}

type ActionEnCours = { offreId: string; type: "cv" | "lm" | "message" | "score" } | null;
type Tri = "score-desc" | "score-asc" | "date-desc";
type FiltreLocalisation = "Toutes" | "Paris" | "IDF";
type FiltreNotation = "Toutes" | "Notees" | "NonNotees";
type FiltreStatut = "Toutes" | "Envoyees";

export default function Dashboard({ offres }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [recherche, setRecherche] = useState("");
  const [source, setSource] = useState("Toutes");
  const [contrat, setContrat] = useState<CategorieContrat | "Toutes">("Toutes");
  const [tri, setTri] = useState<Tri>("score-desc");
  const [localisationFiltre, setLocalisationFiltre] = useState<FiltreLocalisation>("Toutes");
  const [notationFiltre, setNotationFiltre] = useState<FiltreNotation>("Toutes");
  const [statutFiltre, setStatutFiltre] = useState<FiltreStatut>("Toutes");
  const [offreSelectionneeId, setOffreSelectionneeId] = useState<string | null>(null);
  const [modalAjoutOuvert, setModalAjoutOuvert] = useState(false);
  const [suiviOuvert, setSuiviOuvert] = useState(false);
  const [actionEnCours, setActionEnCours] = useState<ActionEnCours>(null);
  const [syncEnCours, setSyncEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avertissements, setAvertissements] = useState<string[]>([]);
  // Cache des descriptions récupérées à la demande (voir app/page.tsx : la
  // liste initiale ne les inclut pas, pour rester légère).
  const [descriptions, setDescriptions] = useState<Record<string, string | null>>({});

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
      const matchNotation =
        notationFiltre === "Toutes" ||
        (notationFiltre === "NonNotees" ? !o.score : Boolean(o.score));
      // Une offre déjà envoyée (ou plus avancée : réponse reçue, entretien,
      // refus, offre) est retirée du dashboard principal par défaut — elle
      // vit désormais dans le suivi des candidatures. Le filtre "Envoyées"
      // permet de la retrouver explicitement, comme pour les stages/alternances.
      const envoyeeOuPlus = estEnvoyeeOuPlus(o.candidature?.statut);
      const matchStatut = statutFiltre === "Envoyees" ? envoyeeOuPlus : !envoyeeOuPlus;
      return (
        matchRecherche && matchSource && matchContrat && matchLocalisation && matchNotation && matchStatut
      );
    });
    liste = [...liste].sort((a, b) => {
      if (tri === "score-desc") return (b.score?.score ?? -1) - (a.score?.score ?? -1);
      if (tri === "score-asc") return (a.score?.score ?? 999) - (b.score?.score ?? 999);
      return (b.date_publication ?? "").localeCompare(a.date_publication ?? "");
    });
    return liste;
  }, [offres, recherche, source, contrat, tri, localisationFiltre, notationFiltre, statutFiltre]);

  const nonNoteesCount = useMemo(
    () => offresPertinentes.filter((o) => !o.score).length,
    [offresPertinentes],
  );

  const envoyeesCount = useMemo(
    () => offres.filter((o) => estEnvoyeeOuPlus(o.candidature?.statut)).length,
    [offres],
  );

  const stats = useMemo(() => {
    const total = offresPertinentes.length;
    const fortes = offresPertinentes.filter((o) => (o.score?.score ?? 0) >= 70).length;
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

  const offreSelectionneeBrute = offres.find((o) => o.id === offreSelectionneeId) ?? null;
  const offreSelectionnee = offreSelectionneeBrute
    ? {
        ...offreSelectionneeBrute,
        description: descriptions[offreSelectionneeBrute.id] ?? offreSelectionneeBrute.description,
      }
    : null;

  useEffect(() => {
    if (!offreSelectionneeId || offreSelectionneeId in descriptions) return;
    let annule = false;
    fetch(`/api/offres/${offreSelectionneeId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!annule && data.offre) {
          setDescriptions((prev) => ({ ...prev, [offreSelectionneeId]: data.offre.description }));
        }
      })
      .catch(() => {});
    return () => {
      annule = true;
    };
  }, [offreSelectionneeId, descriptions]);

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

  async function marquerStatut(offreId: string, statut: CandidatureStatut) {
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

  async function supprimerOffre(offreId: string) {
    if (!window.confirm("Supprimer cette offre ? Cette action est irréversible.")) return;
    setErreur(null);
    try {
      const res = await fetch(`/api/offres/${offreId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la suppression");
      setOffreSelectionneeId(null);
      rafraichir();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de la suppression");
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

  const candidaturesSuivies = offres.filter((o) => estEnvoyeeOuPlus(o.candidature?.statut));

  return (
    <div className="wrap">
      <div className="top-row">
        <div>
          {isPending && <p className="eyebrow">Actualisation...</p>}
          <h1 className="brand-title">Le Rayon</h1>
        </div>
        <div className="top-actions">
          <button className="action-btn" onClick={() => setModalAjoutOuvert(true)}>
            + Ajouter une offre
          </button>
          <button className="action-btn primary" onClick={synchroniser} disabled={syncEnCours}>
            {syncEnCours ? "Synchronisation..." : "Synchroniser"}
          </button>
          <button className="action-btn" onClick={() => setSuiviOuvert(true)}>
            Suivi des candidatures
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
          <b style={{ color: couleurFortesCorrespondances(stats.fortes) }}>{stats.fortes}</b>
          <span>Fortes correspondances</span>
        </div>
        <div className="stat">
          <b style={{ color: couleurScoreMoyen(stats.moyenne) }}>{stats.moyenne}%</b>
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
        <div className="filter-group">
          <span className="filter-group-label">Source</span>
          <div className="chip-row">
            {sourcesDisponibles.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip ${source === s ? "active" : ""}`}
                onClick={() => setSource(s)}
              >
                {s === "Toutes" ? "Toutes" : libelleSource(s)}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-group-label">Contrat</span>
          <div className="chip-row">
            {(["Toutes", "CDI", "CDD", "Alternance", "Stage", "Autre"] as const).map((c) => (
              <button
                key={c}
                type="button"
                className={`chip ${contrat === c ? "active" : ""}`}
                onClick={() => setContrat(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-group-label">Statut</span>
          <div className="chip-row">
            {(
              [
                { valeur: "Toutes", libelle: "Notation : toutes" },
                { valeur: "NonNotees", libelle: `Non notées (${nonNoteesCount})` },
                { valeur: "Notees", libelle: "Notées" },
              ] as const
            ).map(({ valeur, libelle }) => (
              <button
                key={valeur}
                type="button"
                className={`chip ${notationFiltre === valeur ? "active" : ""}`}
                onClick={() => setNotationFiltre(valeur)}
              >
                {libelle}
              </button>
            ))}
          </div>
          <div className="chip-row">
            {(
              [
                { valeur: "Toutes", libelle: "Statut : à traiter" },
                { valeur: "Envoyees", libelle: `Envoyées (${envoyeesCount})` },
              ] as const
            ).map(({ valeur, libelle }) => (
              <button
                key={valeur}
                type="button"
                className={`chip ${statutFiltre === valeur ? "active" : ""}`}
                onClick={() => setStatutFiltre(valeur)}
              >
                {libelle}
              </button>
            ))}
          </div>
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
          onSupprimer={() => supprimerOffre(offreSelectionnee.id)}
        />
      )}

      {suiviOuvert && (
        <CandidatureTrackerModal
          offres={candidaturesSuivies}
          onFermer={() => setSuiviOuvert(false)}
          onChangerStatut={(offreId, statut) => marquerStatut(offreId, statut)}
        />
      )}

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
