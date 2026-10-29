"use client";

import { useState } from "react";
import { formaterDateFr } from "@/lib/prospection/dates";
import { definitionSuivi, TYPES_REPONSE } from "@/lib/prospection/suivi";
import type { ReponseType } from "@/types/database.types";
import type { Prospection } from "@/types/prospection";

interface Proposition {
  message_id: string;
  prospection_id: string;
  confiance: "certaine" | "probable" | "possible";
  entreprise: string;
  destinataire: string | null;
  expediteur: { email: string; nom: string | null };
  date: string;
  sujet: string;
  extrait: string;
  classement: { type: ReponseType | "automatique"; resume: string; urls: string[] };
}

interface Resultat {
  propositions: Proposition[];
  messagesLus: number;
  dejaTraites: number;
  sansCandidature: number;
}

interface Props {
  onAssociee: (prospection: Prospection) => void;
  onFilModifie: () => void;
}

const LIBELLE_CONFIANCE: Record<Proposition["confiance"], string> = {
  certaine: "Réponse directe à ton message",
  probable: "Même expéditeur que ton contact",
  possible: "Même entreprise, autre personne",
};

// Recherche des réponses dans la boîte mail (lecture seule). Chaque réponse
// trouvée est proposée avec son classement ; rien n'est enregistré avant que
// l'utilisateur ne l'associe lui-même à la candidature.
export default function ReponsesPanel({ onAssociee, onFilModifie }: Props) {
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [types, setTypes] = useState<Record<string, ReponseType>>({});
  const [traitement, setTraitement] = useState<Record<string, { enCours: boolean; erreur: string | null }>>({});

  async function rechercher() {
    setEnCours(true);
    setErreur(null);
    try {
      const res = await fetch("/api/prospection/reponses/rechercher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la recherche");
      const trouve = data as Resultat;
      setResultat(trouve);
      setTypes(
        Object.fromEntries(
          trouve.propositions
            .filter((p) => p.classement.type !== "automatique")
            .map((p) => [p.message_id, p.classement.type as ReponseType]),
        ),
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de la recherche");
    } finally {
      setEnCours(false);
    }
  }

  function retirer(messageId: string) {
    setResultat((r) => (r ? { ...r, propositions: r.propositions.filter((p) => p.message_id !== messageId) } : r));
  }

  async function appeler(proposition: Proposition, url: string, corps: Record<string, unknown>) {
    setTraitement((t) => ({ ...t, [proposition.message_id]: { enCours: true, erreur: null } }));
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      return data;
    } catch (e) {
      setTraitement((t) => ({
        ...t,
        [proposition.message_id]: { enCours: false, erreur: e instanceof Error ? e.message : "Erreur" },
      }));
      return null;
    }
  }

  async function associer(p: Proposition) {
    const type = types[p.message_id];
    if (!type) return;
    const data = await appeler(p, "/api/prospection/reponses/enregistrer", {
      message_id: p.message_id,
      prospection_id: p.prospection_id,
      type,
      date: p.date,
      extrait: p.extrait,
      url: p.classement.urls[0] ?? null,
    });
    if (!data) return;
    onAssociee(data.prospection as Prospection);
    onFilModifie();
    retirer(p.message_id);
  }

  async function ignorer(p: Proposition) {
    if (await appeler(p, "/api/prospection/reponses/ignorer", { message_id: p.message_id })) retirer(p.message_id);
  }

  return (
    <div className="prospection-bloc">
      <h3>Réponses reçues</h3>
      <p className="prospection-meta" style={{ marginBottom: 10 }}>
        Lit ta boîte mail en lecture seule, uniquement les messages des entreprises à qui tu as écrit. Rien n&apos;est
        enregistré sans ton accord.
      </p>
      <div className="prospection-actions">
        <button className="action-btn primary" onClick={rechercher} disabled={enCours}>
          {enCours ? "Recherche en cours..." : "Chercher les réponses"}
        </button>
        {resultat && !enCours && (
          <span className="prospection-meta">
            {resultat.messagesLus} message(s) lu(s) · {resultat.propositions.length} à examiner · {resultat.dejaTraites} déjà
            traité(s)
          </span>
        )}
      </div>
      {erreur && <p className="prospection-erreur" style={{ marginTop: 10 }}>{erreur}</p>}

      {resultat && resultat.propositions.length === 0 && !enCours && (
        <p className="track-empty" style={{ paddingBottom: 0 }}>
          Aucune nouvelle réponse à examiner.
        </p>
      )}

      <div className="prospection-liste" style={{ marginTop: 14 }}>
        {resultat?.propositions.map((p) => {
          const etat = traitement[p.message_id];
          const automatique = p.classement.type === "automatique";
          return (
            <div key={p.message_id} className={`prospection-ligne${p.confiance === "certaine" && !automatique ? " ok" : ""}`}>
              <div className="prospection-titre">
                {p.entreprise}
                {p.destinataire ? ` — ${p.destinataire}` : ""}
              </div>
              <div className="prospection-meta">
                {LIBELLE_CONFIANCE[p.confiance]} · de {p.expediteur.nom ?? p.expediteur.email} · {formaterDateFr(p.date)}
              </div>
              <div className="prospection-meta">Objet : {p.sujet || "(sans objet)"}</div>
              {p.extrait && <div className="prospection-citation" style={{ marginTop: 8 }}>{p.extrait}</div>}
              <p className="prospection-meta" style={{ marginTop: 8 }}>
                {automatique ? "Message automatique : " : "Résumé : "}
                {p.classement.resume}
              </p>
              {p.classement.urls[0] && (
                <p className="prospection-meta">
                  Lien indiqué :{" "}
                  <a href={p.classement.urls[0]} target="_blank" rel="noopener noreferrer">
                    {p.classement.urls[0]}
                  </a>
                </p>
              )}
              <div className="prospection-actions" style={{ marginTop: 10 }}>
                {!automatique && (
                  <>
                    <select
                      aria-label="Type de réponse"
                      value={types[p.message_id] ?? "autre"}
                      onChange={(e) => setTypes((t) => ({ ...t, [p.message_id]: e.target.value as ReponseType }))}
                    >
                      {TYPES_REPONSE.map((type) => (
                        <option key={type} value={type}>
                          {definitionSuivi(type).libelle}
                        </option>
                      ))}
                    </select>
                    <button className="action-btn primary" onClick={() => associer(p)} disabled={etat?.enCours}>
                      Associer à cette candidature
                    </button>
                  </>
                )}
                <button className="action-btn" onClick={() => ignorer(p)} disabled={etat?.enCours}>
                  Ignorer
                </button>
              </div>
              {etat?.erreur && <p className="prospection-erreur" style={{ marginTop: 8 }}>{etat.erreur}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
