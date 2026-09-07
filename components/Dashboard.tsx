"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { OffreAvecDetails } from "@/types/dashboard";
import type { Candidature } from "@/types/candidature";
import {
  libelleSource,
  calculerPagesAffichees,
  type CategorieContrat,
  type CandidatureStatut,
} from "@/lib/dashboard-utils";
import OfferCard from "./OfferCard";
import OfferPanel from "./OfferPanel";
import CandidatureTrackerModal from "./CandidatureTrackerModal";
import AddOfferModal from "./AddOfferModal";

type ActionEnCours = { offreId: string; type: "cv" | "lm" | "message" | "score" } | null;
type Tri = "score-desc" | "score-asc" | "date-desc";
type FiltreLocalisation = "Toutes" | "Paris" | "IDF";
type FiltreNotation = "Toutes" | "Notees" | "NonNotees";
type FiltreStatut = "Toutes" | "Envoyees";

interface StatsDashboard {
  total: number;
  fortes: number;
  moyenne: number;
  documentsPrets: number;
  nonNotees: number;
  envoyees: number;
  sources: string[];
}

const STATS_VIDES: StatsDashboard = {
  total: 0,
  fortes: 0,
  moyenne: 0,
  documentsPrets: 0,
  nonNotees: 0,
  envoyees: 0,
  sources: [],
};

const TAILLE_PAGE = 24;
const DEBOUNCE_RECHERCHE_MS = 300;

// Le filtrage/tri/pagination de la liste principale se fait désormais côté
// base (RPC offres_filtrees, voir supabase/migrations/0011) plutôt qu'en
// mémoire sur la totalité du catalogue — celui-ci a dépassé les 1000 lignes
// que PostgREST charge par défaut et continue de grossir. Seule la fiche
// détail d'une offre (jamais plus d'une à la fois) et le suivi des
// candidatures (borné au nombre de candidatures suivies, pas au catalogue)
// utilisent encore une requête directe avec jointure embarquée.
export default function Dashboard() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [rechercheInput, setRechercheInput] = useState("");
  const [recherche, setRecherche] = useState("");
  const [source, setSource] = useState("Toutes");
  const [contrat, setContrat] = useState<CategorieContrat | "Toutes">("Toutes");
  const [tri, setTri] = useState<Tri>("score-desc");
  const [localisationFiltre, setLocalisationFiltre] = useState<FiltreLocalisation>("Toutes");
  const [notationFiltre, setNotationFiltre] = useState<FiltreNotation>("Toutes");
  const [statutFiltre, setStatutFiltre] = useState<FiltreStatut>("Toutes");
  const [page, setPage] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);
  const premierRenduPage = useRef(true);

  const [offresPage, setOffresPage] = useState<OffreAvecDetails[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [chargementListe, setChargementListe] = useState(true);
  const [stats, setStats] = useState<StatsDashboard>(STATS_VIDES);

  const [offreSelectionneeId, setOffreSelectionneeId] = useState<string | null>(null);
  const [offreDetail, setOffreDetail] = useState<OffreAvecDetails | null>(null);
  const [modalAjoutOuvert, setModalAjoutOuvert] = useState(false);
  const [suiviOuvert, setSuiviOuvert] = useState(false);
  const [candidaturesSuivies, setCandidaturesSuivies] = useState<OffreAvecDetails[]>([]);
  const [actionEnCours, setActionEnCours] = useState<ActionEnCours>(null);
  const [syncEnCours, setSyncEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avertissements, setAvertissements] = useState<string[]>([]);

  // Débounce de la recherche texte : évite une requête à chaque frappe.
  useEffect(() => {
    const t = setTimeout(() => setRecherche(rechercheInput), DEBOUNCE_RECHERCHE_MS);
    return () => clearTimeout(t);
  }, [rechercheInput]);

  // Retour en page 1 dès qu'un filtre ou la recherche (débouncée) change —
  // sinon on peut se retrouver sur une page vide après avoir réduit les
  // résultats.
  useEffect(() => {
    setPage(1);
  }, [recherche, source, contrat, tri, localisationFiltre, notationFiltre, statutFiltre]);

  const chargerPage = useCallback(async () => {
    setChargementListe(true);
    const { data, error } = await supabase.rpc("offres_filtrees", {
      p_recherche: recherche,
      p_source: source,
      p_contrat: contrat,
      p_localisation: localisationFiltre,
      p_notation: notationFiltre,
      p_statut: statutFiltre,
      p_tri: tri,
      p_page: page,
      p_taille_page: TAILLE_PAGE,
    });
    if (error) {
      setErreur(error.message);
      setChargementListe(false);
      return;
    }
    const lignes = data ?? [];
    const total = lignes[0]?.total_count ?? 0;
    // Filtres réduits/offre supprimée pendant qu'on était sur une page qui
    // n'existe plus : on se raccroche à la dernière page valide plutôt que
    // d'afficher une liste vide.
    const nbPages = Math.max(1, Math.ceil(total / TAILLE_PAGE));
    if (lignes.length === 0 && total > 0 && page > nbPages) {
      setPage(nbPages);
      return;
    }
    setTotalCount(total);
    setOffresPage(
      lignes.map((l) => ({
        id: l.id,
        user_id: "",
        titre: l.titre,
        entreprise: l.entreprise,
        source: l.source,
        source_id: l.source_id,
        lien_original: l.lien_original,
        localisation: l.localisation,
        date_publication: l.date_publication,
        created_at: l.created_at,
        type_contrat: l.type_contrat,
        type_contrat_libelle: l.type_contrat_libelle,
        alternance: l.alternance,
        stage: l.stage,
        description: undefined,
        score:
          l.score == null
            ? null
            : {
                id: l.id,
                user_id: "",
                offre_id: l.id,
                score: l.score,
                points_forts: l.points_forts ?? [],
                ecarts: l.ecarts ?? [],
                calculated_at: l.created_at,
              },
        candidature:
          l.candidature_statut == null
            ? null
            : {
                id: l.id,
                user_id: "",
                offre_id: l.id,
                date_envoi: l.candidature_date_envoi,
                statut: l.candidature_statut as CandidatureStatut,
                cv_genere_url: l.candidature_cv_genere_url,
                lm_generee_url: l.candidature_lm_generee_url,
                message_motivation: l.candidature_message_motivation,
                created_at: l.created_at,
                updated_at: l.created_at,
              },
      })),
    );
    setChargementListe(false);
  }, [supabase, recherche, source, contrat, localisationFiltre, notationFiltre, statutFiltre, tri, page]);

  const chargerStats = useCallback(async () => {
    const { data, error } = await supabase.rpc("offres_stats");
    if (error || !data || data.length === 0) return;
    const s = data[0];
    setStats({
      total: s.total,
      fortes: s.fortes,
      moyenne: s.moyenne,
      documentsPrets: s.documents_prets,
      nonNotees: s.non_notees,
      envoyees: s.envoyees,
      sources: s.sources ?? [],
    });
  }, [supabase]);

  const chargerDetailOffre = useCallback(
    async (id: string) => {
      const { data, error } = await supabase
        .from("offres")
        .select("*, score:scores(*), candidature:candidatures(*)")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) {
        setOffreDetail(null);
        return;
      }
      setOffreDetail(data as unknown as OffreAvecDetails);
    },
    [supabase],
  );

  useEffect(() => {
    chargerPage();
  }, [chargerPage]);

  useEffect(() => {
    chargerStats();
  }, [chargerStats]);

  useEffect(() => {
    if (!offreSelectionneeId) {
      setOffreDetail(null);
      return;
    }
    chargerDetailOffre(offreSelectionneeId);
  }, [offreSelectionneeId, chargerDetailOffre]);

  const chargerCandidaturesSuivies = useCallback(async () => {
    const { data, error } = await supabase
      .from("offres")
      .select("*, candidatures!inner(*)")
      .neq("candidatures.statut", "a_traiter")
      .order("date_publication", { ascending: false });
    if (error || !data) {
      setCandidaturesSuivies([]);
      return;
    }
    setCandidaturesSuivies(
      data.map((row) => {
        const { candidatures, ...offre } = row as unknown as Record<string, unknown> & {
          candidatures: Candidature;
        };
        return { ...offre, score: null, candidature: candidatures } as OffreAvecDetails;
      }),
    );
  }, [supabase]);

  useEffect(() => {
    if (suiviOuvert) chargerCandidaturesSuivies();
  }, [suiviOuvert, chargerCandidaturesSuivies]);

  async function rafraichirTout() {
    await Promise.all([chargerPage(), chargerStats()]);
    if (offreSelectionneeId) await chargerDetailOffre(offreSelectionneeId);
    if (suiviOuvert) await chargerCandidaturesSuivies();
  }

  const sourcesDisponibles = useMemo(() => ["Toutes", ...stats.sources], [stats.sources]);

  const nbPages = Math.max(1, Math.ceil(totalCount / TAILLE_PAGE));

  // Scroll déclenché après coup (useEffect, pas dans le handler de clic) :
  // le handler ne fait que changer `page`, et c'est seulement une fois que
  // React a fini de réconcilier le DOM avec les nouvelles cartes que le
  // scroll se déclenche. Lancer scrollIntoView AVANT ce commit — comme le
  // faisait la première version, directement dans le handler — mesure la
  // position de la grille sur l'ancien layout : la mise à jour du contenu
  // qui suit immédiatement (surtout quand le nombre de lignes change d'une
  // page à l'autre) peut interrompre ou fausser l'animation en cours, d'où
  // le comportement "ça ne le fait pas à chaque fois".
  useEffect(() => {
    if (premierRenduPage.current) {
      premierRenduPage.current = false;
      return;
    }
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [page]);

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
      await rafraichirTout();
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
      await rafraichirTout();
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
      await rafraichirTout();
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
      await rafraichirTout();
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
      await rafraichirTout();
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
      await rafraichirTout();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de la suppression");
    }
  }

  async function synchroniser() {
    setErreur(null);
    setSyncEnCours(true);
    try {
      await appelerApi("/api/offres/sync", {});
      await rafraichirTout();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de la synchronisation");
    } finally {
      setSyncEnCours(false);
    }
  }

  async function deconnexion() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="wrap">
      <div className="top-row">
        <div>
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
          <b>{stats.fortes}</b>
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
          value={rechercheInput}
          onChange={(e) => setRechercheInput(e.target.value)}
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
                { valeur: "NonNotees", libelle: `Non notées (${stats.nonNotees})` },
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
                { valeur: "Envoyees", libelle: `Envoyées (${stats.envoyees})` },
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

      {!chargementListe && offresPage.length === 0 ? (
        <div className="empty">Aucune offre ne correspond à ces filtres.</div>
      ) : (
        <>
          <div className="grid" ref={gridRef}>
            {offresPage.map((offre) => (
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

          {nbPages > 1 && (
            <div className="pagination">
              <button
                type="button"
                className="action-btn"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
              >
                ← Précédent
              </button>
              <div className="pagination-pages">
                {calculerPagesAffichees(page, nbPages).map((entree, i) =>
                  entree === "…" ? (
                    <span key={`ellipsis-${i}`} className="pagination-ellipsis">
                      …
                    </span>
                  ) : (
                    <button
                      key={entree}
                      type="button"
                      className={`chip ${entree === page ? "active" : ""}`}
                      onClick={() => setPage(entree)}
                    >
                      {entree}
                    </button>
                  ),
                )}
              </div>
              <button
                type="button"
                className="action-btn"
                onClick={() => setPage(Math.min(nbPages, page + 1))}
                disabled={page === nbPages}
              >
                Suivant →
              </button>
            </div>
          )}
        </>
      )}

      {offreDetail && (
        <OfferPanel
          offre={offreDetail}
          chargement={actionEnCours?.offreId === offreDetail.id ? actionEnCours.type : null}
          avertissements={avertissements}
          onFermer={() => {
            setOffreSelectionneeId(null);
            setAvertissements([]);
          }}
          onGenererCv={() => genererCv(offreDetail.id)}
          onGenererLettre={() => genererLettre(offreDetail.id)}
          onGenererMessage={() => genererMessage(offreDetail.id)}
          onNoter={() => noterOffre(offreDetail.id)}
          onMarquerEnvoyee={() => marquerStatut(offreDetail.id, "envoyee")}
          onSupprimer={() => supprimerOffre(offreDetail.id)}
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
            rafraichirTout();
          }}
        />
      )}
    </div>
  );
}
