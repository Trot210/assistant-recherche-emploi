"use client";

import { useState } from "react";
import type { OffreAvecDetails } from "@/types/dashboard";
import {
  bande,
  estAutomatique,
  libelleSource,
  domaine,
  libelleTypeContrat,
  estStageOuAlternance,
} from "@/lib/dashboard-utils";

interface Props {
  offre: OffreAvecDetails;
  chargement: "cv" | "lm" | "message" | "score" | null;
  avertissements: string[];
  onFermer: () => void;
  onGenererCv: () => void;
  onGenererLettre: () => void;
  onGenererMessage: () => void;
  onNoter: () => void;
  onMarquerEnvoyee: () => void;
}

export default function OfferPanel({
  offre,
  chargement,
  avertissements,
  onFermer,
  onGenererCv,
  onGenererLettre,
  onGenererMessage,
  onNoter,
  onMarquerEnvoyee,
}: Props) {
  const b = bande(offre.score?.score);
  const envoyee = offre.candidature?.statut === "envoyee";
  const [copie, setCopie] = useState(false);

  async function copierMessage() {
    if (!offre.candidature?.message_motivation) return;
    await navigator.clipboard.writeText(offre.candidature.message_motivation);
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  }

  return (
    <>
      <div className="overlay show" onClick={onFermer} />
      <div className="panel show">
        <div className="panel-inner">
          <button className="close-btn" onClick={onFermer} aria-label="Fermer">
            ✕
          </button>

          {offre.score ? (
            <div className={`panel-tag ${b}`}>
              <b>{offre.score.score}%</b>
              <i>COMPATIBILITÉ</i>
            </div>
          ) : (
            <div style={{ marginBottom: 18, clear: "both" }}>
              <button className="btn btn-outline" onClick={onNoter} disabled={chargement === "score"}>
                {chargement === "score" ? "Notation en cours..." : "Noter cette offre"}
              </button>
            </div>
          )}

          <h2>{offre.titre}</h2>
          <p className="p-company">
            {offre.entreprise ?? "Entreprise non précisée"} · {offre.localisation ?? "Localisation non précisée"} ·{" "}
            <span className="source">{libelleSource(offre.source)}</span>{" "}
            <span className={`source-type ${estAutomatique(offre.source) ? "auto" : ""}`}>
              {estAutomatique(offre.source) ? "Auto" : "Manuel"}
            </span>{" "}
            <span className={`contrat ${estStageOuAlternance(offre) ? "stage-alternance" : ""}`}>
              {libelleTypeContrat(offre)}
            </span>
          </p>

          <div className="panel-section">
            <h3>Description du poste</h3>
            <p>{offre.description ?? "Aucune description disponible."}</p>
          </div>

          {offre.score && (
            <>
              <div className="panel-section">
                <h3>Points forts de ton profil</h3>
                {offre.score.points_forts.map((p, i) => (
                  <div key={i} className="list-item ok">
                    <span className="mark">✓</span>
                    {p}
                  </div>
                ))}
              </div>
              <div className="panel-section">
                <h3>Écarts à anticiper</h3>
                {offre.score.ecarts.length > 0 ? (
                  offre.score.ecarts.map((e, i) => (
                    <div key={i} className="list-item gap">
                      <span className="mark">−</span>
                      {e}
                    </div>
                  ))
                ) : (
                  <div className="list-item">
                    <span className="mark" />
                    Aucun écart majeur identifié.
                  </div>
                )}
              </div>
            </>
          )}

          {avertissements.length > 0 && (
            <div className="panel-section">
              <h3>⚠ Contrôle qualité — à relire</h3>
              {avertissements.map((a, i) => (
                <div key={i} className="list-item gap">
                  <span className="mark">!</span>
                  {a}
                </div>
              ))}
            </div>
          )}

          <div className="panel-section">
            <h3>Documents</h3>
            <div>
              {offre.candidature?.cv_genere_url || offre.candidature?.lm_generee_url ? (
                <>
                  {offre.candidature?.cv_genere_url && (
                    <div className="doc-row">
                      <div>
                        <span className="doc-name">CV adapté</span>
                        <span className="doc-meta">Prêt</span>
                      </div>
                      <a
                        className="doc-dl"
                        href={offre.candidature.cv_genere_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Télécharger
                      </a>
                    </div>
                  )}
                  {offre.candidature?.lm_generee_url && (
                    <div className="doc-row">
                      <div>
                        <span className="doc-name">Lettre de motivation</span>
                        <span className="doc-meta">Prête</span>
                      </div>
                      <a
                        className="doc-dl"
                        href={offre.candidature.lm_generee_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Télécharger
                      </a>
                    </div>
                  )}
                </>
              ) : (
                <p className="no-docs">Aucun document généré pour l&apos;instant.</p>
              )}
            </div>
          </div>

          {offre.candidature?.message_motivation && (
            <div className="panel-section">
              <h3>Message de motivation court</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>{offre.candidature.message_motivation}</p>
              <p className="doc-meta" style={{ marginTop: 6 }}>
                {offre.candidature.message_motivation.length} / 1800 caractères
              </p>
              <button className="btn btn-outline" style={{ marginTop: 8 }} onClick={copierMessage}>
                {copie ? "Copié ✓" : "Copier le message"}
              </button>
            </div>
          )}

          <div className="panel-section">
            <h3>Candidature</h3>
            <div className="actions">
              <button className="btn btn-primary" onClick={onGenererCv} disabled={chargement === "cv"}>
                {chargement === "cv" ? "Génération..." : "Générer un CV adapté"}
              </button>
              <button className="btn btn-outline" onClick={onGenererLettre} disabled={chargement === "lm"}>
                {chargement === "lm" ? "Génération..." : "Générer une lettre de motivation"}
              </button>
              <button className="btn btn-outline" onClick={onGenererMessage} disabled={chargement === "message"}>
                {chargement === "message"
                  ? "Génération..."
                  : offre.candidature?.message_motivation
                    ? "Régénérer le message court"
                    : "Générer un message de motivation court"}
              </button>
              <a className="btn-link" href={offre.lien_original} target="_blank" rel="noopener noreferrer">
                Voir l&apos;annonce originale sur {libelleSource(offre.source)} ({domaine(offre.lien_original)}) ↗
              </a>
              <div className="mark-sent-row">
                {envoyee ? (
                  <span className="already-sent">
                    Candidature enregistrée le{" "}
                    {offre.candidature?.date_envoi
                      ? new Date(offre.candidature.date_envoi).toLocaleDateString("fr-FR")
                      : ""}
                  </span>
                ) : (
                  <button className="btn btn-outline" onClick={onMarquerEnvoyee}>
                    Marquer comme envoyée
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
