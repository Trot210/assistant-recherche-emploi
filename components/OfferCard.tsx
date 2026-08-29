"use client";

import type { OffreAvecDetails } from "@/types/dashboard";
import {
  paletteScore,
  estAutomatique,
  libelleSource,
  formaterDate,
  libelleTypeContrat,
  estStageOuAlternance,
} from "@/lib/dashboard-utils";

interface Props {
  offre: OffreAvecDetails;
  chargement: "cv" | "lm" | "message" | "score" | null;
  onOuvrir: () => void;
  onNoter: () => void;
}

export default function OfferCard({ offre, chargement, onOuvrir, onNoter }: Props) {
  const palette = offre.score ? paletteScore(offre.score.score) : null;
  const pointsForts = offre.score?.points_forts.slice(0, 2) ?? [];
  const ecarts = offre.score?.ecarts.slice(0, 1) ?? [];
  const documentsPrets = Boolean(offre.candidature?.cv_genere_url || offre.candidature?.lm_generee_url);
  const envoyee = offre.candidature?.statut === "envoyee";

  return (
    <div
      className="card"
      tabIndex={0}
      onClick={onOuvrir}
      onKeyDown={(e) => e.key === "Enter" && onOuvrir()}
    >
      <div className="band" style={{ background: palette?.text }} />
      {offre.score && palette ? (
        <div className="tag" style={{ background: palette.bg, color: palette.text }}>
          <b>{offre.score.score}%</b>
          <i>MATCH</i>
        </div>
      ) : (
        <div
          className="tag none"
          onClick={(e) => {
            e.stopPropagation();
            onNoter();
          }}
        >
          <b>{chargement === "score" ? "…" : "?"}</b>
          <i>NOTER</i>
        </div>
      )}
      <div className="card-top">
        <p className="role">{offre.titre}</p>
        <p className="company">
          {offre.entreprise ?? "Entreprise non précisée"} · {offre.localisation ?? "Localisation non précisée"}
        </p>
      </div>
      <div className="source-row">
        <span className="source">{libelleSource(offre.source)}</span>
        <span className={`source-type ${estAutomatique(offre.source) ? "auto" : ""}`}>
          {estAutomatique(offre.source) ? "Auto" : "Manuel"}
        </span>
        <span className={`contrat ${estStageOuAlternance(offre) ? "stage-alternance" : ""}`}>
          {libelleTypeContrat(offre)}
        </span>
        <span className="date">{formaterDate(offre.date_publication)}</span>
      </div>
      {(pointsForts.length > 0 || ecarts.length > 0) && (
        <div className="skills">
          {pointsForts.map((p, i) => (
            <div key={`p${i}`} className="skill ok">
              <em>✓</em>
              {p.length > 40 ? `${p.slice(0, 40)}…` : p}
            </div>
          ))}
          {ecarts.map((e, i) => (
            <div key={`e${i}`} className="skill gap">
              <em>−</em>
              {e.length > 40 ? `${e.slice(0, 40)}…` : e}
            </div>
          ))}
        </div>
      )}
      <div className="status-line">
        <span className={`status-pill ${envoyee ? "sent" : documentsPrets ? "ready" : ""}`}>
          {envoyee ? "Envoyée" : documentsPrets ? "Documents prêts" : "À traiter"}
        </span>
        <span className="open">Voir le détail →</span>
      </div>
    </div>
  );
}
