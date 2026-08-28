"use client";

import type { OffreAvecDetails } from "@/types/dashboard";
import { libelleSource } from "@/lib/dashboard-utils";

interface Props {
  offres: OffreAvecDetails[];
  onRetirer: (offreId: string) => void;
}

export default function Tracker({ offres, onRetirer }: Props) {
  const lignes = [...offres].sort((a, b) =>
    (b.candidature?.date_envoi ?? "").localeCompare(a.candidature?.date_envoi ?? ""),
  );

  function copierRecapitulatif() {
    const texte = lignes
      .map((o) => {
        const date = o.candidature?.date_envoi
          ? new Date(o.candidature.date_envoi).toLocaleDateString("fr-FR")
          : "";
        return `${date} — ${o.titre} chez ${o.entreprise ?? "?"} (${o.localisation ?? "?"}) — via ${libelleSource(o.source)}`;
      })
      .join("\n");
    navigator.clipboard.writeText(texte || "Aucune candidature enregistrée.");
  }

  return (
    <div className="tracker">
      <div className="tracker-head">
        <div>
          <h2>Suivi des candidatures</h2>
          <p className="tracker-sub">
            Récapitulatif de tes démarches — utile pour ton actualisation mensuelle France Travail.
          </p>
        </div>
        <button className="action-btn" onClick={copierRecapitulatif}>
          Copier le récapitulatif
        </button>
      </div>
      {lignes.length === 0 ? (
        <p className="track-empty">
          Aucune candidature enregistrée pour l&apos;instant. Clique sur « Marquer comme envoyée » depuis la fiche
          d&apos;une offre après avoir postulé.
        </p>
      ) : (
        <table className="track-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Poste</th>
              <th>Entreprise</th>
              <th>Localisation</th>
              <th>Source</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lignes.map((o) => (
              <tr key={o.id}>
                <td>
                  {o.candidature?.date_envoi
                    ? new Date(o.candidature.date_envoi).toLocaleDateString("fr-FR")
                    : ""}
                </td>
                <td>{o.titre}</td>
                <td>{o.entreprise ?? "—"}</td>
                <td>{o.localisation ?? "—"}</td>
                <td>{libelleSource(o.source)}</td>
                <td>
                  <button className="remove-app" onClick={() => onRetirer(o.id)}>
                    Retirer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
