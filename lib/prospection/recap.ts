import { formaterUsd } from "@/lib/anthropic/tarifs";
import { formaterDateFr } from "@/lib/prospection/dates";

// Texte du récapitulatif du matin, envoyé par e-mail à l'utilisateur seul.
// Calcul pur : il ne contient que des noms d'entreprises et des compteurs, jamais
// de coordonnées de tiers ni de secret.

export interface DonneesRecap {
  aujourdhui: string;
  urlSite: string;
  aValider: { entreprise: string; poste: string; relance: boolean }[];
  relancesPreparees: { entreprise: string; poste: string }[];
  // Relances dues qui n'ont pas pu être préparées (limite du jour, plafond, option coupée).
  relancesRestantes: { entreprise: string; poste: string; raison: string }[];
  nouvellesReponses: number;
  // La boîte mail n'a pas pu être lue ce matin (erreur ou délai dépassé).
  reponsesIndisponibles?: boolean;
  actionsDuJour: { entreprise: string; action: string; date: string | null }[];
  // Envois programmés prévus aujourd'hui (information) et envois programmés échoués (à traiter).
  envoisDuJour?: { entreprise: string; heure: string }[];
  envoisEchoues?: { entreprise: string; raison: string }[];
  nouvellesOffres: number;
  prioritaires: { nom: string; score: number; resume: string }[];
  coutMoisUsd: number | null;
  plafondUsd: number | null;
  hunterVerificationsRestantes: number | null;
  plafondAtteint: boolean;
}

export interface Recap {
  sujet: string;
  texte: string;
  // Nombre de choses à faire : sert au sujet et à décider d'envoyer ou non.
  nbActions: number;
}

function pluriel(n: number, singulier: string, pluriel: string): string {
  return n > 1 ? pluriel : singulier;
}

export function construireRecap(d: DonneesRecap): Recap | null {
  const nbActions =
    d.aValider.length +
    d.relancesRestantes.length +
    (d.nouvellesReponses > 0 ? 1 : 0) +
    d.actionsDuJour.length +
    (d.envoisEchoues?.length ?? 0);
  // Les relances déjà préparées sont aussi à valider : elles figurent dans aValider.
  if (nbActions === 0) return null;

  const blocs: string[] = [];

  if (d.nouvellesReponses > 0) {
    blocs.push(
      `RÉPONSES\n${d.nouvellesReponses} nouveau${d.nouvellesReponses > 1 ? "x" : ""} message${d.nouvellesReponses > 1 ? "s" : ""} d'entreprises à qui tu as écrit. Ouvre « Aujourd'hui » et clique sur « Chercher les réponses » pour les classer.`,
    );
  }

  if (d.aValider.length > 0) {
    const lignes = d.aValider.slice(0, 8).map((m) => `- ${m.entreprise} — ${m.poste}${m.relance ? " (relance)" : ""}`);
    blocs.push(`MESSAGES À VALIDER (${d.aValider.length})\n${lignes.join("\n")}`);
  }

  if (d.relancesPreparees.length > 0) {
    blocs.push(
      `RELANCES PRÉPARÉES CE MATIN (${d.relancesPreparees.length})\nRédigées automatiquement, rien n'est envoyé : relis-les avant de valider.\n${d.relancesPreparees.map((r) => `- ${r.entreprise} — ${r.poste}`).join("\n")}`,
    );
  }

  if (d.relancesRestantes.length > 0) {
    blocs.push(
      `RELANCES DUES NON PRÉPARÉES (${d.relancesRestantes.length})\n${d.relancesRestantes.map((r) => `- ${r.entreprise} — ${r.poste} (${r.raison})`).join("\n")}`,
    );
  }

  if (d.envoisEchoues && d.envoisEchoues.length > 0) {
    blocs.push(
      `ENVOIS PROGRAMMÉS ÉCHOUÉS (${d.envoisEchoues.length})\nCes messages ne sont pas partis : corrige le problème puis reprogramme-les.\n${d.envoisEchoues.map((e) => `- ${e.entreprise} : ${e.raison}`).join("\n")}`,
    );
  }

  if (d.envoisDuJour && d.envoisDuJour.length > 0) {
    blocs.push(`ENVOIS PROGRAMMÉS AUJOURD'HUI (${d.envoisDuJour.length})\n${d.envoisDuJour.map((e) => `- ${e.heure} : ${e.entreprise}`).join("\n")}`);
  }

  if (d.actionsDuJour.length > 0) {
    blocs.push(
      `ACTIONS PRÉVUES\n${d.actionsDuJour.map((a) => `- ${a.entreprise} — ${a.action}${a.date ? ` (pour le ${formaterDateFr(a.date)})` : ""}`).join("\n")}`,
    );
  }

  const complements: string[] = [];
  if (d.nouvellesOffres > 0) {
    complements.push(`${d.nouvellesOffres} nouvelle${pluriel(d.nouvellesOffres, "", "s")} offre${pluriel(d.nouvellesOffres, "", "s")} sur tes postes ciblés depuis hier.`);
  }
  if (d.prioritaires.length > 0) {
    complements.push(
      `À écrire en premier :\n${d.prioritaires.map((p) => `- ${p.nom} (priorité ${p.score}/100) : ${p.resume}`).join("\n")}`,
    );
  }
  if (complements.length > 0) blocs.push(`EN PLUS\n${complements.join("\n")}`);

  const infos: string[] = [];
  if (d.coutMoisUsd !== null) {
    infos.push(
      `Claude ce mois-ci : environ ${formaterUsd(d.coutMoisUsd)}${d.plafondUsd ? ` sur ${formaterUsd(d.plafondUsd)}` : ""}${d.plafondAtteint ? " (plafond atteint)" : ""}.`,
    );
  }
  if (d.reponsesIndisponibles) infos.push("La lecture de ta boîte mail n'a pas abouti ce matin : clique sur « Chercher les réponses » pour la relancer.");
  if (d.hunterVerificationsRestantes !== null) infos.push(`Hunter : ${d.hunterVerificationsRestantes} vérification(s) restante(s).`);

  const texte = [
    `Bonjour,`,
    `Voici ce qui t'attend le ${formaterDateFr(d.aujourdhui)}.`,
    ...blocs,
    `Tout se passe ici : ${d.urlSite}/aujourdhui`,
    infos.length > 0 ? infos.join("\n") : "",
    "— Le Rayon (message automatique, il ne part qu'à toi)",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    sujet: `Le Rayon — ${nbActions} ${pluriel(nbActions, "chose", "choses")} à faire aujourd'hui`,
    texte,
    nbActions,
  };
}
