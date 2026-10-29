// Rapprochement entre une réponse reçue par e-mail et la candidature qu'elle
// concerne. Tout ce fichier est du calcul pur : la lecture de la boîte mail
// (lib/mail/imap.ts) et le classement par Claude sont ailleurs.

// Domaines de messagerie grand public : une adresse en gmail.com ne dit rien de
// l'entreprise. On y cherche l'adresse exacte, jamais tout le domaine (ce serait
// lire le courrier de n'importe qui).
const DOMAINES_GRAND_PUBLIC = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "outlook.fr", "hotmail.com", "hotmail.fr", "live.com", "live.fr",
  "msn.com", "yahoo.com", "yahoo.fr", "icloud.com", "me.com", "free.fr", "orange.fr", "wanadoo.fr", "sfr.fr",
  "laposte.net", "neuf.fr", "bbox.fr", "proton.me", "protonmail.com",
]);

export function domaineEmail(email: string): string | null {
  const domaine = email.split("@")[1]?.trim().toLowerCase();
  return domaine || null;
}

export function estDomaineGrandPublic(domaine: string): boolean {
  return DOMAINES_GRAND_PUBLIC.has(domaine.toLowerCase());
}

export interface CritereRecherche {
  type: "adresse" | "domaine";
  valeur: string;
}

// Ce qu'on demande à la boîte mail pour un contact : son domaine d'entreprise, ou
// seulement son adresse s'il écrit depuis une messagerie grand public.
export function critereRecherche(emailContact: string): CritereRecherche | null {
  const domaine = domaineEmail(emailContact);
  if (!domaine) return null;
  return estDomaineGrandPublic(domaine)
    ? { type: "adresse", valeur: emailContact.trim().toLowerCase() }
    : { type: "domaine", valeur: domaine };
}

// --- Identifiants de messages ---------------------------------------------

export function normaliserIdMessage(id: string | null | undefined): string | null {
  const propre = id?.trim().replace(/^<|>$/g, "").trim().toLowerCase();
  return propre || null;
}

// « References » peut arriver en une chaîne « <a@x> <b@y> » ou déjà en liste.
export function listerIdsMessages(valeur: string | string[] | null | undefined): string[] {
  const morceaux = Array.isArray(valeur) ? valeur : (valeur ?? "").split(/\s+/);
  return morceaux.map(normaliserIdMessage).filter((id): id is string => id !== null);
}

// --- Rapprochement ---------------------------------------------------------

export interface EnvoiConnu {
  id: string;
  // Une relance se rattache au message initial : c'est lui qui porte le suivi.
  parentId: string | null;
  smtpMessageId: string | null;
  emailContact: string | null;
  // AAAA-MM-JJ
  dateEnvoi: string;
}

export interface ReponseBrute {
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  fromEmail: string;
  fromNom: string | null;
  date: Date;
  sujet: string;
  texte: string;
}

export type Confiance = "certaine" | "probable" | "possible";

export interface Rapprochement {
  prospectionId: string;
  confiance: Confiance;
}

function tete(envoi: EnvoiConnu): string {
  return envoi.parentId ?? envoi.id;
}

function plusRecent(envois: EnvoiConnu[]): EnvoiConnu | null {
  return [...envois].sort((a, b) => (a.dateEnvoi < b.dateEnvoi ? 1 : -1))[0] ?? null;
}

export function rapprocher(reponse: ReponseBrute, envois: EnvoiConnu[]): Rapprochement | null {
  const jour = reponse.date.toISOString().slice(0, 10);
  const anterieurs = envois.filter((e) => e.dateEnvoi <= jour);

  // 1. Réponse directe : son en-tête cite l'identifiant de l'un de nos e-mails.
  const cites = new Set([normaliserIdMessage(reponse.inReplyTo), ...reponse.references].filter((i): i is string => !!i));
  const direct = envois.find((e) => {
    const id = normaliserIdMessage(e.smtpMessageId);
    return id !== null && cites.has(id);
  });
  if (direct) return { prospectionId: tete(direct), confiance: "certaine" };

  // 2. Même adresse que le contact à qui on a écrit.
  const expediteur = reponse.fromEmail.trim().toLowerCase();
  const memeAdresse = plusRecent(anterieurs.filter((e) => e.emailContact?.trim().toLowerCase() === expediteur));
  if (memeAdresse) return { prospectionId: tete(memeAdresse), confiance: "probable" };

  // 3. Même entreprise (domaine) : un collègue ou un service RH a répondu à sa place.
  const domaine = domaineEmail(expediteur);
  if (domaine && !estDomaineGrandPublic(domaine)) {
    const memeDomaine = plusRecent(anterieurs.filter((e) => (e.emailContact ? domaineEmail(e.emailContact) : null) === domaine));
    if (memeDomaine) return { prospectionId: tete(memeDomaine), confiance: "possible" };
  }

  return null;
}

// --- Lecture du contenu ----------------------------------------------------

// Expéditeurs qui ne sont pas des personnes : accusés automatiques, rapports de
// non-distribution. Inutile de les faire classer par un modèle.
export function estExpediteurAutomatique(email: string): boolean {
  return /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|notifications?|bounce)/i.test(email.split("@")[0] ?? "");
}

const DEBUT_CITATION = [
  /^>/,
  /^on .{5,150} wrote\s*:/i,
  /^le .{5,150}a écrit\s*:/i,
  /^-{2,}\s*(original message|message d.origine|forwarded message)/i,
  /^(de|from|von)\s*:/i,
  /^_{5,}$/,
  /^--\s*$/,
];

// Ne garde que ce que la personne a écrit : on coupe à la première citation du
// message d'origine ou à la signature, puis on borne la longueur.
export function nettoyerCorps(texte: string, max = 600): string {
  const lignes = texte.replace(/\r\n?/g, "\n").split("\n");
  const gardees: string[] = [];
  for (const ligne of lignes) {
    if (DEBUT_CITATION.some((motif) => motif.test(ligne.trim()))) break;
    gardees.push(ligne);
  }
  const propre = gardees.join(" ").replace(/\s+/g, " ").trim();
  return propre.length > max ? `${propre.slice(0, max - 1).trimEnd()}…` : propre;
}

// Seuls les liens réellement écrits dans le message : c'est la liste de
// référence pour écarter tout lien que le modèle aurait « inventé ».
export function extraireUrls(texte: string, max = 5): string[] {
  const trouvees = texte.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
  const propres = trouvees.map((u) => u.replace(/[.,;:!?]+$/, ""));
  return [...new Set(propres)].slice(0, max);
}
