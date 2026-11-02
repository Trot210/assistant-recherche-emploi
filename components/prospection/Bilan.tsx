"use client";

import { useMemo } from "react";
import { bilanProspection, SEUIL_REBOND, type Segment } from "@/lib/prospection/bilan";
import type { ContactEntreprise, Entreprise, Prospection } from "@/types/prospection";

interface Props {
  prospections: Prospection[];
  contacts: ContactEntreprise[];
  entreprises: Entreprise[];
}

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)} %`);

// Barre proportionnelle ; la valeur 0 reste lisible grâce à son libellé.
function Barre({ libelle, valeur, max, couleur, note }: { libelle: string; valeur: number; max: number; couleur: string; note?: string }) {
  const largeur = max > 0 ? Math.max(valeur > 0 ? 4 : 0, (valeur / max) * 100) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 70px", gap: 10, alignItems: "center", margin: "6px 0" }}>
      <span>{libelle}</span>
      <div style={{ background: "var(--line-soft)", borderRadius: 14, height: 22 }}>
        <div style={{ width: `${largeur}%`, background: couleur, height: 22, borderRadius: 14 }} />
      </div>
      <span style={{ fontWeight: 600 }}>
        {valeur}
        {note && <span className="prospection-meta"> {note}</span>}
      </span>
    </div>
  );
}

function TableSegments({ titre, segments }: { titre: string; segments: Segment[] }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div className="filter-group-label" style={{ marginBottom: 4 }}>
        {titre}
      </div>
      {segments.map((s) => (
        <div key={s.cle} className="prospection-meta" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <span>
            {s.libelle}
            {!s.fiable && " (trop peu de messages pour conclure)"}
          </span>
          <span>
            {s.remis} remis · {s.reponses} réponse(s) ({pct(s.tauxReponse)}) · {s.positives} positive(s)
          </span>
        </div>
      ))}
    </div>
  );
}

// Entonnoir de la prospection, à partir de tes messages envoyés : combien arrivent, combien
// reçoivent une réponse, combien sont positives. Les comparaisons (par rôle du contact,
// secteur, langue, poste visé) n'apparaissent qu'à partir de 30 envois : avant, un seul
// message change tous les taux.
export default function Bilan({ prospections, contacts, entreprises }: Props) {
  const bilan = useMemo(() => bilanProspection({ prospections, contacts, entreprises }), [prospections, contacts, entreprises]);
  const e = bilan.entonnoir;
  const reboundTrop = e.tauxRebond !== null && e.tauxRebond > SEUIL_REBOND;

  return (
    <div className="prospection-bloc">
      <h3>Bilan de la prospection</h3>
      {e.envoyes === 0 ? (
        <p className="prospection-meta">Aucun message envoyé pour l&apos;instant : le bilan apparaîtra après le premier envoi.</p>
      ) : (
        <>
          <Barre libelle="Messages envoyés" valeur={e.envoyes} max={e.envoyes} couleur="var(--navy)" />
          <Barre libelle="Remis" valeur={e.remis} max={e.envoyes} couleur="var(--navy-soft)" note={e.rebonds > 0 ? `(${e.rebonds} rebond)` : undefined} />
          <Barre libelle="Réponses" valeur={e.reponses} max={e.envoyes} couleur="var(--amber)" note={e.tauxReponse !== null ? `(${pct(e.tauxReponse)})` : undefined} />
          <Barre libelle="Réponses positives" valeur={e.positives} max={e.envoyes} couleur="var(--emerald)" />
          <Barre libelle="Entretiens" valeur={e.entretiens} max={e.envoyes} couleur="var(--emerald)" />

          <p className="prospection-meta" style={{ marginTop: 10 }}>
            Taux de rebond :{" "}
            <b className={reboundTrop ? "prospection-erreur" : undefined}>{pct(e.tauxRebond)}</b>{" "}
            {reboundTrop
              ? `— au-dessus de ${Math.round(SEUIL_REBOND * 100)} % : vérifie les adresses avant d'envoyer pour protéger ton adresse d'envoi.`
              : `(objectif : moins de ${Math.round(SEUIL_REBOND * 100)} %)`}
          </p>
          <p className="prospection-meta">
            Parmi les {e.reponses} réponse(s) : {e.positives} positive(s), {e.negatives} refus ou « pas de poste », {e.autres} autre(s) ou sans type.
            {e.delaiMoyenJours !== null && ` Délai moyen de réponse : ${e.delaiMoyenJours} jour(s).`} Relances envoyées : {e.relancesEnvoyees}.
          </p>

          {bilan.segments === null ? (
            <div className="prospection-ligne" style={{ marginTop: 12 }}>
              <div className="prospection-titre" style={{ fontSize: 16 }}>
                Comparaisons à partir de {bilan.progressionSeuil.seuil} envois
              </div>
              <div className="prospection-meta">
                {bilan.progressionSeuil.envoyes} / {bilan.progressionSeuil.seuil} : avec si peu de messages, aucun écart entre deux
                catégories n&apos;est fiable. Quand le seuil sera atteint, tu verras ici ce qui marche le mieux (rôle du contact, secteur,
                langue, poste visé).
              </div>
            </div>
          ) : (
            <>
              <TableSegments titre="Par rôle du contact" segments={bilan.segments.role} />
              <TableSegments titre="Par secteur" segments={bilan.segments.secteur} />
              <TableSegments titre="Par langue" segments={bilan.segments.langue} />
              <TableSegments titre="Par poste visé" segments={bilan.segments.poste} />
            </>
          )}
        </>
      )}
    </div>
  );
}
