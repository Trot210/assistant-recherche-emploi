// Conseil sur une réponse reçue. Tout ce fichier est du calcul pur : la lecture
// de la boîte mail (lib/mail/imap.ts) et l'analyse par Claude
// (lib/anthropic/conseil-reponse.ts) sont ailleurs. Le conseil n'envoie rien :
// il propose, l'utilisateur copie ou ouvre un brouillon dans sa messagerie.

import type { ReponseBrute } from "@/lib/prospection/reponses";

export const CATEGORIES = [
  "interet",
  "demande_infos",
  "redirection",
  "transmis",
  "cv_non_conserve",
  "pas_de_besoin",
  "plus_tard",
  "refus",
  "autre",
] as const;
export type Categorie = (typeof CATEGORIES)[number];

export const RECOMMANDATIONS = ["repondre", "repondre_court", "agir_d_abord", "attendre", "ne_pas_repondre"] as const;
export type Recommandation = (typeof RECOMMANDATIONS)[number];

export const LIBELLE_CATEGORIE: Record<Categorie, string> = {
  interet: "Réponse positive",
  demande_infos: "Demande d'informations",
  redirection: "Redirection vers un site ou un canal",
  transmis: "CV transmis à quelqu'un d'autre",
  cv_non_conserve: "Candidatures spontanées non conservées",
  pas_de_besoin: "Pas de besoin actuellement",
  plus_tard: "À recontacter plus tard",
  refus: "Réponse négative",
  autre: "Autre",
};

export const LIBELLE_RECOMMANDATION: Record<Recommandation, string> = {
  repondre: "Répondre",
  repondre_court: "Répondre brièvement (courtoisie)",
  agir_d_abord: "Agir d'abord, répondre ensuite",
  attendre: "Ne pas répondre pour l'instant, attendre",
  ne_pas_repondre: "Ne pas répondre",
};

// Les recommandations pour lesquelles un exemple de réponse a un sens : dans les
// autres, en proposer un pousserait à écrire un message inutile.
const AVEC_BROUILLON: ReadonlySet<Recommandation> = new Set(["repondre", "repondre_court", "agir_d_abord"]);

export function recommandationAvecBrouillon(recommandation: Recommandation): boolean {
  return AVEC_BROUILLON.has(recommandation);
}

export interface Interlocuteur {
  nom: string | null;
  poste: string | null;
  email: string | null;
}

export interface Brouillon {
  objet: string;
  // Message complet, formule d'appel et signature comprises.
  corps: string;
}

export interface ConseilReponse {
  categorie: Categorie;
  resume: string;
  interlocuteur: Interlocuteur;
  recommandation: Recommandation;
  justification: string;
  // Ce que l'utilisateur peut faire de son côté (postuler sur le site, noter la date...).
  action_suggeree: string | null;
  // AAAA-MM-JJ : quand reprendre contact si rien ne bouge, null s'il n'y a pas lieu de relancer.
  relance_date: string | null;
  // La personne demande à ne plus être contactée.
  ne_plus_contacter: boolean;
  brouillon: Brouillon | null;
  // D'où vient le texte analysé : le message complet, ou seulement l'extrait enregistré.
  source: "message" | "extrait";
  // Avertissements du contrôle de fidélité sur le brouillon.
  avertissements: string[];
  // Liens réellement écrits dans le message (site carrières, offre) : jamais inventés.
  liens?: string[];
  // Identifiant (brut) du message reçu : la réponse envoyée s'y rattache dans le fil.
  reponse_message_id?: string | null;
}

// Cohérence entre la recommandation et le brouillon, appliquée par le code et non
// laissée au modèle : pas d'exemple de réponse quand on conseille de ne pas
// répondre, et jamais de message à quelqu'un qui demande à ne plus être contacté.
export function appliquerRegles(conseil: ConseilReponse): ConseilReponse {
  if (conseil.ne_plus_contacter) {
    return {
      ...conseil,
      recommandation: "ne_pas_repondre",
      relance_date: null,
      brouillon: null,
      action_suggeree: conseil.action_suggeree,
    };
  }
  if (!recommandationAvecBrouillon(conseil.recommandation)) {
    return { ...conseil, brouillon: null };
  }
  return conseil;
}

// Date de reprise de contact calculée à partir d'un délai en jours (le modèle ne
// fournit jamais de date : il se tromperait de jour ou d'année). Bornée à 180 jours.
export function dateRelance(aujourdhui: string, delaiJours: number | null | undefined): string | null {
  if (delaiJours === null || delaiJours === undefined || !Number.isFinite(delaiJours)) return null;
  const jours = Math.round(delaiJours);
  if (jours < 1 || jours > 180) return null;
  const date = new Date(`${aujourdhui}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + jours);
  return date.toISOString().slice(0, 10);
}

// Quelle réponse analyser parmi celles reçues de l'entreprise. On privilégie le
// message déjà associé à la candidature (identifiant connu), puis celui daté du
// jour de réponse enregistré, ou à défaut le plus proche de cette date ; sans
// date, le plus récent.
export function choisirReponse(
  candidates: ReponseBrute[],
  options: { reponseDate: string | null; messageIdsConnus: string[] },
): ReponseBrute | null {
  if (candidates.length === 0) return null;

  const connu = candidates.find((c) => options.messageIdsConnus.includes(c.messageId));
  if (connu) return connu;

  const parRecence = [...candidates].sort((a, b) => b.date.getTime() - a.date.getTime());
  if (!options.reponseDate) return parRecence[0];

  const cible = new Date(`${options.reponseDate}T12:00:00Z`).getTime();
  return [...candidates].sort((a, b) => Math.abs(a.date.getTime() - cible) - Math.abs(b.date.getTime() - cible))[0];
}

// « Re: » devant l'objet reçu, sans l'empiler s'il y est déjà.
export function objetReponse(sujetRecu: string | null | undefined, sujetEnvoye: string): string {
  const base = (sujetRecu ?? "").trim() || sujetEnvoye.trim();
  return /^(re|réf|ref)\s*:/i.test(base) ? base : `Re: ${base}`;
}

// Un exemple peut contenir un passage à compléter entre crochets (« [titre de
// l'offre] ») : l'interface prévient tant qu'il en reste.
export function passagesACompleter(texte: string): string[] {
  return [...texte.matchAll(/\[([^\]\n]{1,80})\]/g)].map((m) => m[1]);
}

// --- Envoi d'une réponse depuis le site -----------------------------------

export const OBJET_MAX = 200;
export const CORPS_MAX = 5000;

// Clé qui identifie « la réponse reçue à laquelle on répond » : l'envoi d'une
// réponse est verrouillé par cette clé, une même réponse ne reçoit pas deux messages.
export function cleEnvoiReponse(params: { messageId: string | null; reponseDate: string | null; prospectionId: string }): string {
  return params.messageId ? `msg:${params.messageId}` : `extrait:${params.prospectionId}:${params.reponseDate ?? "?"}`;
}

const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

// Contrôles faits côté serveur avant tout envoi, quoi qu'affiche l'interface :
// renvoie la raison du refus, ou null si l'envoi est permis. Le destinataire vient
// du conseil enregistré (l'expéditeur de la réponse), jamais du navigateur.
export function refusEnvoiReponse(params: {
  conseil: Pick<ConseilReponse, "recommandation" | "ne_plus_contacter" | "interlocuteur">;
  objet: string;
  corps: string;
  adresseUtilisateur: string;
}): string | null {
  const { conseil, objet, corps } = params;
  if (conseil.ne_plus_contacter) return "Cette personne a demandé à ne plus être contactée : aucun message ne peut lui être envoyé.";
  if (!recommandationAvecBrouillon(conseil.recommandation)) {
    return "L'analyse recommande de ne pas répondre ici : aucun message n'est proposé à l'envoi.";
  }
  const destinataire = conseil.interlocuteur.email?.trim() ?? "";
  if (!EMAIL.test(destinataire)) return "Aucune adresse de destinataire fiable pour cette réponse.";
  if (destinataire.toLowerCase() === params.adresseUtilisateur.trim().toLowerCase()) {
    return "Le destinataire est ta propre adresse.";
  }
  if (!objet.trim() || /[\r\n]/.test(objet)) return "L'objet est vide ou contient un saut de ligne.";
  if (objet.length > OBJET_MAX) return `L'objet dépasse ${OBJET_MAX} caractères.`;
  if (!corps.trim()) return "Le message est vide.";
  if (corps.length > CORPS_MAX) return `Le message dépasse ${CORPS_MAX} caractères.`;
  const aCompleter = passagesACompleter(corps);
  if (aCompleter.length > 0) return `Il reste à compléter : ${aCompleter.map((p) => `[${p}]`).join(", ")}.`;
  return null;
}
