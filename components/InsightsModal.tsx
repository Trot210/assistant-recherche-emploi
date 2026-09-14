"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { libelleSource } from "@/lib/dashboard-utils";
import {
  analyserEcarts,
  bucketLocalisation,
  detecterDoublons,
  moyenneParGroupe,
  preTrierParMotsCles,
  type GroupeDoublons,
  type MoyenneParGroupe,
  type OffreProteeHeuristique,
  type ThemeEcart,
} from "@/lib/insights-utils";

interface Props {
  onFermer: () => void;
  onOuvrirOffre: (offreId: string) => void;
}

interface OffreLegere {
  id: string;
  titre: string;
  entreprise: string | null;
  source: string;
  localisation: string | null;
}

interface ScoreLeger {
  offre_id: string;
  score: number;
  ecarts: string[] | null;
}

// Toutes les données lues ici existent déjà en base (offres, scores, profil)
// — aucun appel Claude n'est déclenché par ce panneau, voir lib/insights-utils.ts.
async function chargerToutesLesLignes<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const TAILLE_PAGE = 1000;
  const lignes: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await page(offset, offset + TAILLE_PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    lignes.push(...data);
    if (data.length < TAILLE_PAGE) break;
    offset += TAILLE_PAGE;
  }
  return lignes;
}

export default function InsightsModal({ onFermer, onOuvrirOffre }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [themesEcarts, setThemesEcarts] = useState<ThemeEcart[]>([]);
  const [parSource, setParSource] = useState<MoyenneParGroupe[]>([]);
  const [parLocalisation, setParLocalisation] = useState<MoyenneParGroupe[]>([]);
  const [doublons, setDoublons] = useState<GroupeDoublons[]>([]);
  const [preTri, setPreTri] = useState<OffreProteeHeuristique[]>([]);

  useEffect(() => {
    let annule = false;

    async function charger() {
      try {
        const [{ data: profilRow }, scores, offres] = await Promise.all([
          supabase.from("profil").select("preferences").maybeSingle(),
          chargerToutesLesLignes<ScoreLeger>((from, to) =>
            supabase.from("scores").select("offre_id, score, ecarts").range(from, to),
          ),
          chargerToutesLesLignes<OffreLegere>((from, to) =>
            supabase.from("offres").select("id, titre, entreprise, source, localisation").range(from, to),
          ),
        ]);
        if (annule) return;

        const offresParId = new Map(offres.map((o) => [o.id, o]));
        const scoresAvecOffre = scores
          .map((s) => ({ ...s, offre: offresParId.get(s.offre_id) }))
          .filter((s): s is ScoreLeger & { offre: OffreLegere } => Boolean(s.offre));

        setThemesEcarts(analyserEcarts(scores.map((s) => s.ecarts ?? [])));
        setParSource(
          moyenneParGroupe(
            scoresAvecOffre.map((s) => ({ groupe: libelleSource(s.offre.source), score: s.score })),
          ),
        );
        setParLocalisation(
          moyenneParGroupe(
            scoresAvecOffre.map((s) => ({ groupe: bucketLocalisation(s.offre.localisation), score: s.score })),
          ),
        );
        setDoublons(detecterDoublons(offres).slice(0, 10));

        const idsNotes = new Set(scores.map((s) => s.offre_id));
        const intitulesCibles = Array.isArray(
          (profilRow?.preferences as { intitules_cibles?: unknown } | null)?.intitules_cibles,
        )
          ? ((profilRow?.preferences as { intitules_cibles?: string[] }).intitules_cibles as string[])
          : [];
        const offresNonNotees = offres.filter((o) => !idsNotes.has(o.id));
        setPreTri(preTrierParMotsCles(offresNonNotees, intitulesCibles).slice(0, 15));
      } catch (e) {
        if (!annule) setErreur(e instanceof Error ? e.message : "Erreur lors du chargement des insights");
      } finally {
        if (!annule) setChargement(false);
      }
    }

    charger();
    return () => {
      annule = true;
    };
  }, [supabase]);

  const maxTheme = Math.max(1, ...themesEcarts.map((t) => t.count));

  return (
    <div className="modal-overlay show" onClick={onFermer}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onFermer} aria-label="Fermer">
          ✕
        </button>
        <h2 style={{ clear: "both" }}>Insights</h2>
        <p className="tracker-sub">
          Analyses tirées de ce qui est déjà en base — aucun appel payant, rien de nouveau n&apos;est noté.
        </p>

        {chargement ? (
          <p className="insight-empty">Chargement...</p>
        ) : erreur ? (
          <p className="error-text">{erreur}</p>
        ) : (
          <>
            <div className="insight-section">
              <h3>Thèmes récurrents dans les écarts</h3>
              {themesEcarts.length === 0 ? (
                <p className="insight-empty">Pas encore assez d&apos;offres notées pour dégager une tendance.</p>
              ) : (
                themesEcarts.map((t) => (
                  <div className="insight-bar-row" key={t.theme}>
                    <span className="insight-bar-label">{t.theme}</span>
                    <span className="insight-bar-track">
                      <span
                        className="insight-bar-fill"
                        style={{ width: `${Math.round((t.count / maxTheme) * 100)}%` }}
                      />
                    </span>
                    <span className="insight-bar-count">{t.count}</span>
                  </div>
                ))
              )}
            </div>

            <div className="insight-section">
              <h3>Score moyen par localisation</h3>
              {parLocalisation.length === 0 ? (
                <p className="insight-empty">Pas encore d&apos;offres notées.</p>
              ) : (
                parLocalisation.map((g) => (
                  <div className="insight-bar-row" key={g.groupe}>
                    <span className="insight-bar-label">{g.groupe}</span>
                    <span className="insight-bar-track">
                      <span className="insight-bar-fill" style={{ width: `${g.moyenne}%` }} />
                    </span>
                    <span className="insight-bar-count">
                      {g.moyenne}% ({g.total})
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="insight-section">
              <h3>Score moyen par source</h3>
              {parSource.length === 0 ? (
                <p className="insight-empty">Pas encore d&apos;offres notées.</p>
              ) : (
                parSource.map((g) => (
                  <div className="insight-bar-row" key={g.groupe}>
                    <span className="insight-bar-label">{g.groupe}</span>
                    <span className="insight-bar-track">
                      <span className="insight-bar-fill" style={{ width: `${g.moyenne}%` }} />
                    </span>
                    <span className="insight-bar-count">
                      {g.moyenne}% ({g.total})
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="insight-section">
              <h3>Doublons potentiels</h3>
              <p className="insight-section-hint">
                Même intitulé et même entreprise détectés sur plusieurs offres (republications probables).
              </p>
              {doublons.length === 0 ? (
                <p className="insight-empty">Aucun doublon évident détecté.</p>
              ) : (
                doublons.map((d) => (
                  <div className="insight-heuristique-row" key={d.cle} style={{ cursor: "default" }}>
                    <span className="insight-heuristique-titre">
                      {d.titre} — {d.entreprise}
                    </span>
                    <span className="insight-heuristique-score">×{d.count}</span>
                  </div>
                ))
              )}
            </div>

            <div className="insight-section">
              <h3>Meilleures offres non notées (estimation gratuite)</h3>
              <p className="insight-section-hint">
                Classées par proximité de mots-clés avec tes intitulés ciblés — un indice pour prioriser, pas
                un vrai score.
              </p>
              {preTri.length === 0 ? (
                <p className="insight-empty">
                  Rien à estimer pour l&apos;instant (renseigne des intitulés ciblés dans ton profil, ou tout
                  est déjà noté).
                </p>
              ) : (
                preTri.map((o) => (
                  <div
                    className="insight-heuristique-row"
                    key={o.id}
                    onClick={() => {
                      onOuvrirOffre(o.id);
                      onFermer();
                    }}
                  >
                    <span className="insight-heuristique-titre">{o.titre}</span>
                    <span className="insight-heuristique-score">{o.scoreHeuristique.toFixed(2)}</span>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
