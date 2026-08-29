"use client";

import { useState } from "react";
import type { OffreAvecDetails } from "@/types/dashboard";
import {
  libelleSource,
  libelleStatutCandidature,
  STATUTS_CANDIDATURE_ORDRE,
  type CandidatureStatut,
} from "@/lib/dashboard-utils";

interface Props {
  offres: OffreAvecDetails[];
  onFermer: () => void;
  onChangerStatut: (offreId: string, statut: CandidatureStatut) => void;
}

const STATUTS_SUIVI = STATUTS_CANDIDATURE_ORDRE.filter((s) => s !== "a_traiter") as CandidatureStatut[];

export default function CandidatureTrackerModal({ offres, onFermer, onChangerStatut }: Props) {
  const [copie, setCopie] = useState(false);

  const lignes = [...offres].sort((a, b) =>
    (b.candidature?.date_envoi ?? "").localeCompare(a.candidature?.date_envoi ?? ""),
  );

  function copierRecapitulatif() {
    const texte = lignes
      .map((o) => {
        const date = o.candidature?.date_envoi
          ? new Date(o.candidature.date_envoi).toLocaleDateString("fr-FR")
          : "";
        const statut = o.candidature ? libelleStatutCandidature(o.candidature.statut) : "";
        return `${date} — ${o.titre} chez ${o.entreprise ?? "?"} (${libelleSource(o.source)}) — ${statut}`;
      })
      .join("\n");
    navigator.clipboard.writeText(texte || "Aucune candidature enregistrée.");
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  }

  return (
    <div className="modal-overlay show" onClick={onFermer}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onFermer} aria-label="Fermer">
          ✕
        </button>
        <h2 style={{ clear: "both" }}>Suivi des candidatures</h2>
        <p className="tracker-sub">
          Récapitulatif de tes démarches — utile pour ton actualisation mensuelle France Travail.
        </p>

        {lignes.length === 0 ? (
          <p className="track-empty">
            Aucune candidature enregistrée pour l&apos;instant. Marque une offre comme envoyée depuis sa
            fiche de détail après avoir postulé.
          </p>
        ) : (
          <>
            <button type="button" className="btn btn-outline" style={{ marginBottom: 16 }} onClick={copierRecapitulatif}>
              {copie ? "Copié ✓" : "Copier le récapitulatif"}
            </button>
            <div className="candidature-list">
              {lignes.map((o) => (
                <div key={o.id} className="candidature-row">
                  <div className="candidature-row-main">
                    <p className="candidature-poste">{o.titre}</p>
                    <p className="candidature-meta">
                      {o.entreprise ?? "Entreprise non précisée"}
                      {o.candidature?.date_envoi
                        ? ` · Envoyée le ${new Date(o.candidature.date_envoi).toLocaleDateString("fr-FR")}`
                        : ""}
                    </p>
                  </div>
                  <select
                    value={o.candidature?.statut ?? "envoyee"}
                    onChange={(e) => onChangerStatut(o.id, e.target.value as CandidatureStatut)}
                  >
                    {STATUTS_SUIVI.map((s) => (
                      <option key={s} value={s}>
                        {libelleStatutCandidature(s)}
                      </option>
                    ))}
                    <option value="a_traiter">Retirer du suivi</option>
                  </select>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
