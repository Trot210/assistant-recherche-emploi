"use client";

import { useMemo, useState } from "react";
import type { OffreAvecDetails } from "@/types/dashboard";
import {
  calculerStatsCandidatures,
  joursDepuisEnvoi,
  libelleSource,
  libelleStatutCandidature,
  necessiteRelance,
  STATUTS_CANDIDATURE_ORDRE,
  type CandidatureStatut,
} from "@/lib/dashboard-utils";
import { telechargerCsv, versLigneCsv } from "@/lib/csv";

interface Props {
  offres: OffreAvecDetails[];
  onFermer: () => void;
  onChangerStatut: (offreId: string, statut: CandidatureStatut) => void;
}

const STATUTS_SUIVI = STATUTS_CANDIDATURE_ORDRE.filter((s) => s !== "a_traiter") as CandidatureStatut[];

type EtatSauvegarde = "inactif" | "enregistrement" | "enregistre" | "erreur";

function NotesCandidature({ offreId, notesInitiales }: { offreId: string; notesInitiales: string | null }) {
  const [ouvert, setOuvert] = useState(false);
  const [texte, setTexte] = useState(notesInitiales ?? "");
  const [derniereSauvegarde, setDerniereSauvegarde] = useState(notesInitiales ?? "");
  const [etat, setEtat] = useState<EtatSauvegarde>("inactif");
  const [messageErreur, setMessageErreur] = useState<string | null>(null);

  async function enregistrer() {
    if (texte === derniereSauvegarde) return;
    setEtat("enregistrement");
    setMessageErreur(null);
    try {
      const res = await fetch("/api/candidatures/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offre_id: offreId, notes: texte }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de l'enregistrement");
      setDerniereSauvegarde(texte);
      setEtat("enregistre");
    } catch (e) {
      setMessageErreur(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
      setEtat("erreur");
    }
  }

  const apercu = texte.trim().split("\n")[0].slice(0, 70);

  return (
    <div className="candidature-notes">
      <button type="button" className="candidature-notes-toggle" onClick={() => setOuvert((v) => !v)}>
        {ouvert ? "Masquer les notes" : texte.trim() ? "Notes" : "+ Ajouter une note"}
      </button>
      {!ouvert && apercu && <span className="candidature-notes-apercu">{apercu}</span>}
      {ouvert && (
        <>
          <textarea
            className="candidature-notes-champ"
            value={texte}
            maxLength={2000}
            placeholder="Recruteur, date de relance prévue, retour d'entretien…"
            onChange={(e) => {
              setTexte(e.target.value);
              setEtat("inactif");
            }}
            onBlur={enregistrer}
          />
          <p className="candidature-notes-etat">
            {etat === "enregistrement" && "Enregistrement…"}
            {etat === "enregistre" && "Enregistré"}
            {etat === "erreur" && <span className="error-text-inline">{messageErreur}</span>}
          </p>
        </>
      )}
    </div>
  );
}

export default function CandidatureTrackerModal({ offres, onFermer, onChangerStatut }: Props) {
  const [copie, setCopie] = useState(false);

  const maintenant = useMemo(() => new Date(), []);

  const lignes = [...offres].sort((a, b) =>
    (b.candidature?.date_envoi ?? "").localeCompare(a.candidature?.date_envoi ?? ""),
  );

  const stats = useMemo(() => calculerStatsCandidatures(lignes, maintenant), [lignes, maintenant]);
  const nbARelancer = useMemo(
    () => lignes.filter((o) => necessiteRelance(o.candidature, maintenant)).length,
    [lignes, maintenant],
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

  function exporterExcel() {
    const entetes = versLigneCsv([
      "Date d'envoi",
      "Intitulé du poste",
      "Entreprise",
      "Localisation",
      "Source",
      "Statut",
      "Lien de l'annonce",
      "Notes",
    ]);
    const corps = lignes.map((o) =>
      versLigneCsv([
        o.candidature?.date_envoi ? new Date(o.candidature.date_envoi).toLocaleDateString("fr-FR") : "",
        o.titre,
        o.entreprise,
        o.localisation,
        libelleSource(o.source),
        o.candidature ? libelleStatutCandidature(o.candidature.statut) : "",
        o.lien_original,
        o.candidature?.notes ?? "",
      ]),
    );
    const date = new Date().toISOString().slice(0, 10);
    telechargerCsv(`candidatures-${date}.csv`, [entetes, ...corps]);
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
            {nbARelancer > 0 && (
              <p className="tracker-relance-alerte">
                {nbARelancer} candidature{nbARelancer > 1 ? "s" : ""} sans réponse depuis plus de 15
                jours — pense à relancer.
              </p>
            )}
            <div className="stats tracker-stats">
              <div className="stat">
                <b>{stats.total}</b>
                <span>Candidatures suivies</span>
              </div>
              <div className="stat">
                <b>{stats.envoyeesCeMois}</b>
                <span>Envoyées ce mois</span>
              </div>
              <div className="stat">
                <b>{stats.tauxReponse}%</b>
                <span>Taux de réponse</span>
              </div>
              <div className="stat">
                <b>{stats.entretiens}</b>
                <span>Entretiens</span>
              </div>
            </div>
            <div className="tracker-export-actions">
              <button type="button" className="btn btn-outline" onClick={copierRecapitulatif}>
                {copie ? "Copié ✓" : "Copier le récapitulatif"}
              </button>
              <button type="button" className="btn btn-outline" onClick={exporterExcel}>
                Exporter en Excel (.csv)
              </button>
            </div>
            <div className="candidature-list">
              {lignes.map((o) => {
                const relance = necessiteRelance(o.candidature, maintenant);
                return (
                  <div key={o.id} className={`candidature-row${relance ? " a-relancer" : ""}`}>
                    <div className="candidature-row-main">
                      <p className="candidature-poste">{o.titre}</p>
                      <p className="candidature-meta">
                        {o.entreprise ?? "Entreprise non précisée"}
                        {o.candidature?.date_envoi
                          ? ` · Envoyée le ${new Date(o.candidature.date_envoi).toLocaleDateString("fr-FR")}`
                          : ""}
                        {relance && o.candidature?.date_envoi
                          ? ` · ⚠ ${joursDepuisEnvoi(o.candidature.date_envoi, maintenant)}j sans réponse`
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
                    <NotesCandidature offreId={o.id} notesInitiales={o.candidature?.notes ?? null} />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
