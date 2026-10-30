import { domaineEmail, type EnvoiConnu } from "@/lib/prospection/reponses";

// Un « rebond » est le message d'erreur renvoyé par le serveur du destinataire
// quand l'adresse n'existe pas ou refuse le message. Calcul pur : la lecture de
// la boîte mail est dans lib/mail/imap.ts.

export interface RebondBrut {
  messageId: string;
  date: Date;
  sujet: string;
  // En-tête X-Failed-Recipients, quand le serveur le fournit.
  destinatairesEnTete: string[];
  texte: string;
}

export interface RebondAnalyse {
  // Adresses en échec, en minuscules.
  destinataires: string[];
  // true seulement pour un échec définitif (adresse inconnue...). Un retard de
  // livraison ou une boîte pleine ne rend pas l'adresse invalide.
  definitif: boolean;
}

const ADRESSE = /[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

const RETARD = /delay|retard|toujours pas|n'a pas encore|still trying|temporar|temporaire/i;
// La boîte du destinataire est saturée : l'adresse existe, elle n'est pas invalide.
const BOITE_PLEINE = /mailbox (is )?full|over quota|quota exceeded|boîte.{0,30}pleine|\b5\.2\.2\b/i;
const ECHEC_DEFINITIF =
  /\b5\.[1-7]\.\d{1,3}\b|\b55\d\b|n'existe pas|introuvable|inconnu|does not exist|doesn't exist|couldn't be found|could not be found|not found|unknown user|user unknown|no such user|address rejected|wasn't delivered|was not delivered|n'a pas été remis|non remis|undeliverable|delivery has failed/i;

function nettoyerAdresse(a: string): string {
  return a.trim().toLowerCase().replace(/^[<'"]+|[>'".,;:]+$/g, "");
}

// Adresses visées par le rapport : l'en-tête d'abord, puis les lignes
// « Final-Recipient » des rapports standard, puis le texte libre.
export function extraireDestinatairesRebond(rebond: Pick<RebondBrut, "destinatairesEnTete" | "texte">, adresseUtilisateur: string): string[] {
  const moi = adresseUtilisateur.trim().toLowerCase();
  const trouvees: string[] = [];
  const ajouter = (a: string) => {
    const propre = nettoyerAdresse(a);
    if (propre && propre !== moi && !/^(mailer-daemon|postmaster)@/.test(propre) && !trouvees.includes(propre)) trouvees.push(propre);
  };

  rebond.destinatairesEnTete.flatMap((h) => h.match(ADRESSE) ?? []).forEach(ajouter);
  if (trouvees.length > 0) return trouvees;

  for (const m of rebond.texte.matchAll(/(?:final|original)-recipient\s*:\s*(?:rfc822\s*;\s*)?(\S+)/gi)) ajouter(m[1]);
  if (trouvees.length > 0) return trouvees;

  // Texte libre : les messages de Gmail commencent par « Your message wasn't delivered to x@y ».
  const debut = rebond.texte.slice(0, 1500);
  (debut.match(ADRESSE) ?? []).forEach(ajouter);
  return trouvees.slice(0, 3);
}

export function analyserRebond(rebond: RebondBrut, adresseUtilisateur: string): RebondAnalyse {
  const contenu = `${rebond.sujet}\n${rebond.texte.slice(0, 3000)}`;
  const definitif = !RETARD.test(rebond.sujet) && !BOITE_PLEINE.test(contenu) && ECHEC_DEFINITIF.test(contenu);
  return { destinataires: extraireDestinatairesRebond(rebond, adresseUtilisateur), definitif };
}

export interface RebondRapproche {
  prospectionId: string;
  adresse: string;
}

// Rattache un rebond au message initial de la candidature envoyée à cette adresse
// avant que le rebond n'arrive (le plus récent si plusieurs).
export function rapprocherRebond(analyse: RebondAnalyse, date: Date, envois: EnvoiConnu[]): RebondRapproche | null {
  const jour = date.toISOString().slice(0, 10);
  for (const adresse of analyse.destinataires) {
    const candidats = envois
      .filter((e) => e.emailContact?.trim().toLowerCase() === adresse && e.dateEnvoi <= jour)
      .sort((a, b) => (a.dateEnvoi < b.dateEnvoi ? 1 : -1));
    if (candidats[0]) return { prospectionId: candidats[0].parentId ?? candidats[0].id, adresse };
  }
  return null;
}

// Domaines à interroger dans la boîte : les expéditeurs de rapports sont des
// robots du fournisseur de messagerie de l'utilisateur, pas des entreprises.
export const EXPEDITEURS_REBOND = ["mailer-daemon", "postmaster"] as const;

export function estAdresseRebond(email: string): boolean {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  return EXPEDITEURS_REBOND.some((e) => local === e || local.startsWith(`${e}+`)) && domaineEmail(email) !== null;
}
