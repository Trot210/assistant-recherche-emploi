"use client";

import type { Fiche, FaitSource } from "@/types/fiche";

interface Props {
  fiche: Fiche;
  onAjouterAdresse: () => void;
}

function Faits({ titre, faits }: { titre: string; faits: FaitSource[] }) {
  if (faits.length === 0) return null;
  return (
    <div>
      <div className="filter-group-label" style={{ marginBottom: 4 }}>
        {titre}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>
        {faits.map((f) => (
          <li key={f.texte}>
            {f.texte}{" "}
            <a href={f.source_url} target="_blank" rel="noopener noreferrer" className="prospection-meta">
              [source]
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function FicheEntreprise({ fiche, onAjouterAdresse }: Props) {
  const adresse = fiche.adresse_candidature;

  return (
    <div className="prospection-bloc" style={{ marginTop: 12, marginBottom: 0, background: "var(--paper)" }}>
      <h3>Fiche issue de sources publiques</h3>
      <p style={{ margin: "0 0 10px", fontSize: 13.5 }}>
        {fiche.activite}
        {fiche.site_web && (
          <>
            {" "}
            <a href={fiche.site_web} target="_blank" rel="noopener noreferrer" className="prospection-meta">
              [site officiel]
            </a>
          </>
        )}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Faits titre="Marques" faits={fiche.marques} />
        <Faits titre="Enjeux" faits={fiche.enjeux} />
        <Faits titre="Actualités" faits={fiche.actualites} />

        {fiche.postes_suggeres.length > 0 && (
          <div>
            <div className="filter-group-label" style={{ marginBottom: 4 }}>
              Postes suggérés
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>
              {fiche.postes_suggeres.map((p) => (
                <li key={p.poste}>
                  <b>{p.poste}</b> — {p.raison}
                </li>
              ))}
            </ul>
          </div>
        )}

        {adresse && !adresse.confirmee && (
          <div className="prospection-alerte">
            Adresse de candidature repérée : <b>{adresse.email}</b>, mais aucun extrait de la page ne la confirme.
            Vérifie-la sur{" "}
            <a href={adresse.source_url} target="_blank" rel="noopener noreferrer">
              la page source
            </a>{" "}
            avant de l&apos;ajouter.{" "}
            <button className="prospection-link-btn" onClick={onAjouterAdresse}>
              Je l&apos;ai vérifiée, ajouter
            </button>
          </div>
        )}
        {!adresse && (
          <p className="prospection-meta" style={{ margin: 0 }}>
            Aucune adresse de candidature spontanée publiée n&apos;a été trouvée.
          </p>
        )}
      </div>
    </div>
  );
}
