"use client";

import { useState } from "react";
import { libelleLangue } from "@/lib/prospection/langue";
import { formaterDateFr } from "@/lib/prospection/dates";
import { definitionSuivi, idSuivi, STATUTS_SUIVI, type IdSuivi } from "@/lib/prospection/suivi";
import { texteSuppressionMessage } from "@/lib/prospection/suppression";
import { aujourdhuiParis } from "@/lib/prospection/workflow";
import type { Langue } from "@/types/database.types";
import type { ContactEntreprise, Entreprise, Prospection } from "@/types/prospection";
import Confirmation from "./Confirmation";
import type { CvInfo } from "./MessageCard";

interface Props {
  prospection: Prospection;
  // Relances déjà envoyées dans ce fil.
  relances: Prospection[];
  // Toutes les relances du fil, brouillons compris : elles partent avec le message.
  nbRelances: number;
  entreprise: Entreprise | undefined;
  contact: ContactEntreprise | undefined;
  cvs: Record<Langue, CvInfo | null>;
  onChange: (prospection: Prospection) => void;
  onFilModifie: () => void;
  onSupprime: (ids: string[]) => void;
}

type ChampsSauvegardables = {
  commentaire?: string | null;
  prochaine_action?: string | null;
  prochaine_action_date?: string | null;
  reponse_date?: string | null;
};

// Une candidature envoyée, repliée sur une ligne : entreprise, destinataire, date
// et statut. Dépliée, elle montre le message, le CV joint, la réponse reçue, et
// permet de suivre la candidature (statut, commentaire, prochaine action).
export default function MessageEnvoye({
  prospection,
  relances,
  nbRelances,
  entreprise,
  contact,
  cvs,
  onChange,
  onFilModifie,
  onSupprime,
}: Props) {
  const [ouvert, setOuvert] = useState(false);
  const [commentaire, setCommentaire] = useState(prospection.commentaire ?? "");
  const [action, setAction] = useState(prospection.prochaine_action ?? "");
  const [enregistrement, setEnregistrement] = useState<"inactif" | "en_cours" | "ok">("inactif");
  const [erreur, setErreur] = useState<string | null>(null);
  const [suppression, setSuppression] = useState({ ouverte: false, enCours: false, erreur: null as string | null });

  const courant = idSuivi(prospection);
  const definition = definitionSuivi(courant);
  const cv = cvs[prospection.langue];
  const aReponse = prospection.statut === "reponse_recue";
  const actionEnRetard =
    prospection.prochaine_action_date !== null && prospection.prochaine_action_date <= aujourdhuiParis();

  async function appeler(corps: Record<string, unknown>) {
    setEnregistrement("en_cours");
    setErreur(null);
    try {
      const res = await fetch(`/api/prospection/${prospection.id}/suivi`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de l'enregistrement");
      onChange(data.prospection as Prospection);
      setEnregistrement("ok");
      return true;
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
      setEnregistrement("inactif");
      return false;
    }
  }

  async function changerStatut(id: IdSuivi) {
    if (await appeler({ statut_suivi: id })) onFilModifie();
  }

  function enregistrer(champs: ChampsSauvegardables) {
    return appeler(champs);
  }

  async function supprimer() {
    setSuppression({ ouverte: true, enCours: true, erreur: null });
    try {
      const res = await fetch(`/api/prospection/${prospection.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la suppression");
      onSupprime(data.supprimes as string[]);
    } catch (e) {
      setSuppression({ ouverte: true, enCours: false, erreur: e instanceof Error ? e.message : "Erreur lors de la suppression" });
    }
  }

  const options = STATUTS_SUIVI.filter((s) => courant === "envoye" || s.id !== "envoye");

  return (
    <div className={`prospection-ligne${actionEnRetard ? " due" : definition.ton === "positif" ? " ok" : ""}`}>
      <div className="prospection-ligne-tete">
        <div>
          <div className="prospection-titre">
            {entreprise?.nom ?? "Entreprise"} — {contact?.nom ?? "Sans contact précis"}
          </div>
          <div className="prospection-meta">
            Envoyé le {formaterDateFr(prospection.date_envoi)} · {prospection.poste_vise} · {libelleLangue(prospection.langue)}
            {prospection.statut === "envoyee" && prospection.prochaine_relance &&
              ` · relance prévue le ${formaterDateFr(prospection.prochaine_relance)}`}
            {prospection.prochaine_action &&
              ` · À faire : ${prospection.prochaine_action}${prospection.prochaine_action_date ? ` (${formaterDateFr(prospection.prochaine_action_date)})` : ""}`}
          </div>
        </div>
        <div className="prospection-actions">
          <span className={`status-pill ${definition.ton}`}>{definition.libelle}</span>
          <button className="action-btn" onClick={() => setOuvert((v) => !v)} aria-expanded={ouvert}>
            {ouvert ? "Fermer" : "Ouvrir"}
          </button>
          <button
            className="prospection-croix"
            aria-label="Supprimer cette candidature"
            title="Supprimer cette candidature"
            onClick={() => setSuppression({ ouverte: true, enCours: false, erreur: null })}
          >
            ✕
          </button>
        </div>
      </div>

      {suppression.ouverte && (
        <Confirmation
          texte={texteSuppressionMessage({
            nomEntreprise: entreprise?.nom ?? "cette entreprise",
            envoye: true,
            dateEnvoi: formaterDateFr(prospection.date_envoi),
            nbRelances,
          })}
          actions={[{ libelle: "Supprimer définitivement", onClick: supprimer, danger: true }]}
          enCours={suppression.enCours}
          erreur={suppression.erreur}
          onAnnuler={() => setSuppression({ ouverte: false, enCours: false, erreur: null })}
        />
      )}

      {ouvert && (
        <div className="prospection-detail">
          <div className="prospection-grille">
            <div>
              <div className="filter-group-label">Destinataire</div>
              {contact ? `${contact.nom}${contact.email ? ` <${contact.email}>` : ""}` : "Aucun contact précis"}
            </div>
            <div>
              <div className="filter-group-label">Objet</div>
              {prospection.objet}
            </div>
            <div>
              <div className="filter-group-label">CV joint</div>
              {cv ? (
                <>
                  {cv.nomFichier}
                  {cv.url && (
                    <>
                      {" — "}
                      <a href={cv.url} target="_blank" rel="noopener noreferrer">
                        ouvrir
                      </a>
                    </>
                  )}
                </>
              ) : (
                `CV ${prospection.langue === "en" ? "anglais" : "français"} (plus enregistré)`
              )}
            </div>
          </div>

          <div>
            <div className="filter-group-label" style={{ marginBottom: 4 }}>
              Message envoyé
            </div>
            <div className="prospection-texte">{prospection.corps}</div>
          </div>

          {relances.length > 0 && (
            <div>
              <div className="filter-group-label" style={{ marginBottom: 4 }}>
                Relances envoyées
              </div>
              {relances.map((r, i) => (
                <div key={r.id} className="prospection-meta">
                  Relance n°{i + 1} · envoyée le {formaterDateFr(r.date_envoi)} · {r.objet}
                </div>
              ))}
            </div>
          )}

          {aReponse && (prospection.reponse_extrait || prospection.reponse_date) && (
            <div>
              <div className="filter-group-label" style={{ marginBottom: 4 }}>
                Réponse reçue{prospection.reponse_date ? ` le ${formaterDateFr(prospection.reponse_date)}` : ""}
              </div>
              {prospection.reponse_extrait && <div className="prospection-citation">{prospection.reponse_extrait}</div>}
              {prospection.reponse_url && (
                <p className="prospection-meta" style={{ marginTop: 6 }}>
                  Lien indiqué :{" "}
                  <a href={prospection.reponse_url} target="_blank" rel="noopener noreferrer">
                    {prospection.reponse_url}
                  </a>
                </p>
              )}
            </div>
          )}

          <div className="prospection-grille">
            <label>
              Statut de la candidature
              <select value={courant} onChange={(e) => changerStatut(e.target.value as IdSuivi)}>
                {options.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.libelle}
                  </option>
                ))}
              </select>
            </label>
            {aReponse && (
              <label>
                Date de la réponse
                <input
                  type="date"
                  value={prospection.reponse_date ?? ""}
                  onChange={(e) => enregistrer({ reponse_date: e.target.value || null })}
                />
              </label>
            )}
          </div>

          <label>
            Commentaire
            <textarea
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              onBlur={() => commentaire.trim() !== (prospection.commentaire ?? "") && enregistrer({ commentaire })}
              placeholder="ex : réponse de la RH, à surveiller sur le site carrières..."
            />
          </label>

          <div className="prospection-grille">
            <label>
              Prochaine action
              <input
                type="text"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                onBlur={() => action.trim() !== (prospection.prochaine_action ?? "") && enregistrer({ prochaine_action: action })}
                placeholder="ex : postuler sur le site carrières"
              />
            </label>
            <label>
              Pour le
              <input
                type="date"
                value={prospection.prochaine_action_date ?? ""}
                onChange={(e) => enregistrer({ prochaine_action_date: e.target.value || null })}
              />
            </label>
          </div>

          {enregistrement === "en_cours" && <p className="prospection-meta">Enregistrement...</p>}
          {enregistrement === "ok" && <p className="prospection-info">Enregistré.</p>}
          {erreur && <p className="prospection-erreur">{erreur}</p>}
        </div>
      )}
    </div>
  );
}
