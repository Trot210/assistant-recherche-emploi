import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { listerIdsMessages, normaliserIdMessage, type CritereRecherche, type ReponseBrute } from "@/lib/prospection/reponses";
import { EXPEDITEURS_REBOND, type RebondBrut } from "@/lib/prospection/rebonds";

// Lecture des réponses reçues, avec le même mot de passe d'application que
// l'envoi (SMTP_USER / SMTP_PASSWORD, ou IMAP_USER / IMAP_PASSWORD pour une autre
// boîte). Garde-fous :
//  - lecture seule : la boîte est ouverte en mode « examen », aucun message n'est
//    marqué comme lu, déplacé ni supprimé ;
//  - périmètre limité : on ne cherche que les messages venant des adresses ou des
//    domaines d'entreprise à qui une candidature a été envoyée ;
//  - rien n'est conservé ici : les messages sont lus, rapprochés puis oubliés.
function identifiants(): { user: string | undefined; pass: string | undefined } {
  return {
    user: process.env.IMAP_USER ?? process.env.SMTP_USER,
    pass: process.env.IMAP_PASSWORD ?? process.env.SMTP_PASSWORD,
  };
}

export function imapConfigure(): boolean {
  const { user, pass } = identifiants();
  return Boolean(user && pass);
}

export class ImapNonConfigure extends Error {
  constructor() {
    super("La lecture des réponses n'est pas configurée : renseigne SMTP_USER et SMTP_PASSWORD dans .env.local");
    this.name = "ImapNonConfigure";
  }
}

// Un message dont seul le HTML existe : on en tire un texte brut sommaire.
function texteDepuisHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ");
}

const TAILLE_MAX_MESSAGE = 150_000;
const TEXTE_MAX = 8000;

export interface ParametresLecture {
  criteres: CritereRecherche[];
  depuis: Date;
  // Adresse de l'utilisateur : ses propres messages ne sont jamais des réponses.
  adresseUtilisateur: string;
  maxParCritere?: number;
}

export async function lireReponsesCandidates(params: ParametresLecture): Promise<ReponseBrute[]> {
  const { user, pass } = identifiants();
  if (!user || !pass) throw new ImapNonConfigure();

  const client = new ImapFlow({
    host: process.env.IMAP_HOST ?? "imap.gmail.com",
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: true,
    auth: { user, pass },
    logger: false,
    // Sans ces délais, une boîte qui ne répond pas bloquerait la requête pendant plus d'une minute.
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 40_000,
  });

  const trouvees = new Map<string, ReponseBrute>();
  const moi = params.adresseUtilisateur.trim().toLowerCase();

  await client.connect();
  try {
    // Gmail range tout dans « Tous les messages » (nom traduit selon la langue) :
    // on le repère par son rôle, pas par son nom, pour retrouver aussi les
    // réponses déjà archivées.
    const boites = await client.list();
    const chemin = boites.find((b) => b.specialUse === "\\All")?.path ?? "INBOX";
    const verrou = await client.getMailboxLock(chemin, { readOnly: true });
    try {
      for (const critere of params.criteres) {
        const uids = await client.search(
          { from: critere.type === "domaine" ? `@${critere.valeur}` : critere.valeur, since: params.depuis },
          { uid: true },
        );
        if (!uids || uids.length === 0) continue;

        const recents = uids.slice(-(params.maxParCritere ?? 40));
        for await (const message of client.fetch(
          recents,
          { uid: true, source: { maxLength: TAILLE_MAX_MESSAGE } },
          { uid: true },
        )) {
          if (!message.source) continue;
          const analyse = await simpleParser(message.source);
          const id = normaliserIdMessage(analyse.messageId);
          const expediteur = analyse.from?.value[0];
          if (!id || !expediteur?.address || trouvees.has(id)) continue;

          const adresse = expediteur.address.trim().toLowerCase();
          if (adresse === moi) continue;

          const brut = analyse.text ?? (typeof analyse.html === "string" ? texteDepuisHtml(analyse.html) : "");
          trouvees.set(id, {
            messageId: id,
            inReplyTo: normaliserIdMessage(analyse.inReplyTo),
            references: listerIdsMessages(analyse.references),
            fromEmail: adresse,
            fromNom: expediteur.name?.trim() || null,
            date: analyse.date ?? new Date(),
            sujet: analyse.subject ?? "",
            texte: brut.slice(0, TEXTE_MAX),
          });
        }
      }
    } finally {
      verrou.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  return [...trouvees.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
}

export interface ParametresRebonds {
  depuis: Date;
  max?: number;
}

// Rapports de non-distribution reçus depuis `depuis` : mêmes garde-fous que la
// lecture des réponses (lecture seule, rien n'est modifié ni conservé ici). On
// ne cherche que les expéditeurs « robot » du fournisseur de messagerie.
export async function lireRebonds(params: ParametresRebonds): Promise<RebondBrut[]> {
  const { user, pass } = identifiants();
  if (!user || !pass) throw new ImapNonConfigure();

  const client = new ImapFlow({
    host: process.env.IMAP_HOST ?? "imap.gmail.com",
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: true,
    auth: { user, pass },
    logger: false,
    // Sans ces délais, une boîte qui ne répond pas bloquerait la requête pendant plus d'une minute.
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 40_000,
  });

  const trouves = new Map<string, RebondBrut>();

  await client.connect();
  try {
    const boites = await client.list();
    const chemin = boites.find((b) => b.specialUse === "\\All")?.path ?? "INBOX";
    const verrou = await client.getMailboxLock(chemin, { readOnly: true });
    try {
      for (const expediteur of EXPEDITEURS_REBOND) {
        const uids = await client.search({ from: expediteur, since: params.depuis }, { uid: true });
        if (!uids || uids.length === 0) continue;

        for await (const message of client.fetch(
          uids.slice(-(params.max ?? 30)),
          { uid: true, source: { maxLength: TAILLE_MAX_MESSAGE } },
          { uid: true },
        )) {
          if (!message.source) continue;
          const analyse = await simpleParser(message.source);
          const id = normaliserIdMessage(analyse.messageId);
          if (!id || trouves.has(id)) continue;

          const enTete = analyse.headers.get("x-failed-recipients");
          const rapport = analyse.attachments
            .filter((a) => /delivery-status/i.test(a.contentType))
            .map((a) => a.content.toString("utf8"))
            .join("\n");
          const brut = analyse.text ?? (typeof analyse.html === "string" ? texteDepuisHtml(analyse.html) : "");

          trouves.set(id, {
            messageId: id,
            date: analyse.date ?? new Date(),
            sujet: analyse.subject ?? "",
            destinatairesEnTete: typeof enTete === "string" ? [enTete] : [],
            texte: `${brut}\n${rapport}`.slice(0, TEXTE_MAX),
          });
        }
      }
    } finally {
      verrou.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  return [...trouves.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
}
