"use client";

import { libelleVerification } from "@/lib/hunter/verification";
import { pertinenceContact } from "@/lib/prospection/contacts";
import type { ContactEntreprise } from "@/types/prospection";

interface Props {
  contact: ContactEntreprise;
  // Poste visé choisi à l'écran : sert à dire à quel point le contact correspond.
  posteCible: string;
  recommande: boolean;
  hunterActif: boolean;
  // Identifiant du contact en cours de vérification (un seul à la fois), ou null.
  verificationEnCours: string | null;
  onVerifier: (contact: ContactEntreprise) => void;
  onBasculer: (contact: ContactEntreprise) => void;
  onSupprimer: (id: string) => void;
}

// Une personne de la fiche entreprise : nom, poste, son rôle pour le poste visé, son
// adresse et d'où elle vient, avec les actions (vérifier, ne plus contacter, supprimer).
export default function ContactLigne({ contact: c, posteCible, recommande, hunterActif, verificationEnCours, onVerifier, onBasculer, onSupprimer }: Props) {
  const pertinence = pertinenceContact(c, posteCible);
  return (
    <div className="prospection-contact">
      <span>
        <b>{c.nom}</b>
        {c.email_statut === "invalide" && <span className="prospection-erreur"> [adresse invalide]</span>}
        {c.email_statut === "ne_plus_contacter" && <span className="prospection-erreur"> [ne plus contacter]</span>}
        {c.poste && ` — ${c.poste}`}
        {c.email && c.poste && (
          <span className={pertinence.role === "decideur" ? "prospection-info" : "prospection-meta"}>
            {" "}
            [{pertinence.libelle}
            {recommande ? " · recommandé" : ""}]
          </span>
        )}
        {c.email ? ` — ${c.email}` : " — pas d'e-mail"}
        {c.email && (
          <span className={c.email_verification === "invalide" ? "prospection-erreur" : "prospection-meta"}>
            {" "}
            ({libelleVerification(c.email_verification)})
          </span>
        )}
        {c.source_url ? (
          <span className="prospection-meta">
            {" "}
            (
            <a href={c.source_url} target="_blank" rel="noopener noreferrer">
              {c.origine === "hunter" ? "Hunter · page source" : "page source"}
            </a>
            )
          </span>
        ) : (
          c.source_email && <span className="prospection-meta"> (source : {c.source_email})</span>
        )}
      </span>
      <span>
        {hunterActif && c.email && (
          <>
            <button className="prospection-link-btn" onClick={() => onVerifier(c)} disabled={verificationEnCours !== null}>
              {verificationEnCours === c.id ? "Vérification..." : "Vérifier"}
            </button>{" "}
          </>
        )}
        <button className="prospection-link-btn" onClick={() => onBasculer(c)}>
          {c.email_statut === "ok" ? "Ne plus contacter" : "Rétablir"}
        </button>{" "}
        <button className="prospection-link-btn" onClick={() => onSupprimer(c.id)}>
          Supprimer
        </button>
      </span>
    </div>
  );
}
