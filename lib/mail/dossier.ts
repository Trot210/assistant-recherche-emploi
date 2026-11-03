import type { ImapFlow } from "imapflow";
import { creerClientImap, imapConfigure } from "@/lib/mail/imap";
import { normaliserIdMessage, listerIdsMessages, type ReponseBrute } from "@/lib/prospection/reponses";

// Dossier (libellé Gmail) qui centralise la prospection : les messages envoyés y sont
// COPIÉS (ils restent dans « Envoyés ») et les réponses y sont DÉPLACÉES hors de la boîte
// de réception. Seuls des messages que l'application a identifiés comme faisant partie de
// la prospection sont touchés ; rien n'est supprimé, tout reste dans « Tous les messages ».
export const NOM_DOSSIER = "Prospection 🥶";

export interface BilanDossier {
  dossierCree: boolean;
  copies: number;
  deplaces: number;
  // Déjà hors de la boîte de réception : simplement ajoutés au dossier.
  ajoutes: number;
  introuvables: number;
  erreurs: string[];
}

export const BILAN_VIDE: BilanDossier = { dossierCree: false, copies: 0, deplaces: 0, ajoutes: 0, introuvables: 0, erreurs: [] };

export function dossierDisponible(): boolean {
  return imapConfigure();
}

// Crée le dossier s'il n'existe pas ; renvoie son chemin.
async function assurerDossier(client: ImapFlow): Promise<{ chemin: string; cree: boolean }> {
  const boites = await client.list();
  const existant = boites.find((b) => b.name === NOM_DOSSIER || b.path === NOM_DOSSIER);
  if (existant) return { chemin: existant.path, cree: false };
  const resultat = await client.mailboxCreate(NOM_DOSSIER);
  return { chemin: resultat.path, cree: true };
}

async function trouver(client: ImapFlow, idBrut: string): Promise<number[]> {
  const uids = await client.search({ header: { "message-id": idBrut } }, { uid: true });
  return uids || [];
}

// Copie dans le dossier les messages envoyés (identifiants tels qu'écrits dans le message).
async function copierEnvoyes(client: ImapFlow, dossier: string, ids: string[], bilan: BilanDossier, reessais: number) {
  const boites = await client.list();
  const envoyes = boites.find((b) => b.specialUse === "\\Sent")?.path;
  if (!envoyes) {
    bilan.erreurs.push("Dossier « Envoyés » introuvable");
    return;
  }
  const verrou = await client.getMailboxLock(envoyes);
  try {
    for (const id of ids) {
      try {
        let uids: number[] = [];
        // Juste après un envoi, la copie peut mettre un instant à apparaître dans « Envoyés ».
        for (let essai = 0; essai <= reessais; essai++) {
          uids = await trouver(client, id);
          if (uids.length > 0) break;
          if (essai < reessais) await new Promise((r) => setTimeout(r, 1500));
        }
        if (uids.length === 0) {
          bilan.introuvables += 1;
          continue;
        }
        await client.messageCopy(uids, dossier, { uid: true });
        bilan.copies += 1;
      } catch (e) {
        bilan.erreurs.push(e instanceof Error ? e.message : "copie impossible");
      }
    }
  } finally {
    verrou.release();
  }
}

// Déplace dans le dossier les réponses reçues : retirées de la boîte de réception, ajoutées au
// dossier. Une réponse déjà archivée est seulement ajoutée au dossier.
async function deplacerRecus(client: ImapFlow, dossier: string, ids: string[], bilan: BilanDossier, reessais = 0) {
  const archives: string[] = [];

  const verrouBoite = await client.getMailboxLock("INBOX");
  try {
    for (const id of ids) {
      try {
        let uids: number[] = [];
        // Un message qu'on vient de s'envoyer à soi-même peut mettre un instant à arriver.
        for (let essai = 0; essai <= reessais; essai++) {
          uids = await trouver(client, id);
          if (uids.length > 0) break;
          if (essai < reessais) await new Promise((r) => setTimeout(r, 1500));
        }
        if (uids.length === 0) {
          archives.push(id);
          continue;
        }
        await client.messageMove(uids, dossier, { uid: true });
        bilan.deplaces += 1;
      } catch (e) {
        bilan.erreurs.push(e instanceof Error ? e.message : "déplacement impossible");
      }
    }
  } finally {
    verrouBoite.release();
  }

  if (archives.length === 0) return;
  const boites = await client.list();
  const tous = boites.find((b) => b.specialUse === "\\All")?.path;
  if (!tous) return;
  const verrou = await client.getMailboxLock(tous);
  try {
    for (const id of archives) {
      try {
        const uids = await trouver(client, id);
        if (uids.length === 0) {
          bilan.introuvables += 1;
          continue;
        }
        await client.messageCopy(uids, dossier, { uid: true });
        bilan.ajoutes += 1;
      } catch (e) {
        bilan.erreurs.push(e instanceof Error ? e.message : "ajout impossible");
      }
    }
  } finally {
    verrou.release();
  }
}

export async function classerDansDossier(params: {
  envoyes?: string[];
  recus?: string[];
  reessaisEnvoyes?: number;
  reessaisRecus?: number;
}): Promise<BilanDossier> {
  const bilan: BilanDossier = { ...BILAN_VIDE, erreurs: [] };
  const envoyes = params.envoyes ?? [];
  const recus = params.recus ?? [];

  const client = creerClientImap();
  await client.connect();
  try {
    const { chemin, cree } = await assurerDossier(client);
    bilan.dossierCree = cree;
    if (envoyes.length > 0) await copierEnvoyes(client, chemin, envoyes, bilan, params.reessaisEnvoyes ?? 0);
    if (recus.length > 0) await deplacerRecus(client, chemin, recus, bilan, params.reessaisRecus ?? 0);
  } finally {
    await client.logout().catch(() => undefined);
  }
  return bilan;
}

// Juste après un envoi : copie ce message dans le dossier. Jamais bloquant pour l'envoi
// lui-même, qui est déjà parti : une erreur est seulement journalisée.
export async function classerEnvoiRecent(messageId: string): Promise<void> {
  if (!dossierDisponible()) return;
  try {
    const bilan = await Promise.race([
      classerDansDossier({ envoyes: [messageId], reessaisEnvoyes: 3 }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 12_000)),
    ]);
    if (bilan && bilan.erreurs.length > 0) console.error("Classement de l'envoi dans le dossier:", bilan.erreurs.join(" ; "));
  } catch (e) {
    console.error("Classement de l'envoi dans le dossier impossible:", e);
  }
}

// --- Lecture légère de la boîte de réception ----------------------------------

function entete(brut: Buffer | undefined, nom: string): string {
  if (!brut) return "";
  const texte = brut.toString("utf8").replace(/\r?\n[ \t]+/g, " ");
  const m = new RegExp(`^${nom}:\\s*(.*)$`, "im").exec(texte);
  return m ? m[1].trim() : "";
}

function versReponseBrute(m: { envelope?: { messageId?: string; from?: { address?: string; name?: string }[]; date?: Date | string; subject?: string }; headers?: Buffer }): ReponseBrute | null {
  const idBrut = m.envelope?.messageId ?? entete(m.headers, "message-id");
  const id = normaliserIdMessage(idBrut);
  const de = m.envelope?.from?.[0];
  if (!id || !de?.address) return null;
  return {
    messageId: id,
    messageIdBrut: idBrut || undefined,
    inReplyTo: normaliserIdMessage(entete(m.headers, "in-reply-to")),
    references: listerIdsMessages(entete(m.headers, "references")),
    fromEmail: de.address.trim().toLowerCase(),
    fromNom: de.name?.trim() || null,
    date: m.envelope?.date ? new Date(m.envelope.date) : new Date(),
    sujet: m.envelope?.subject ?? "",
    texte: "",
  };
}

const CHAMPS = { uid: true, envelope: true, headers: ["in-reply-to", "references", "message-id"] } as const;

// Messages arrivés en boîte de réception depuis `depuis`, réduits à leurs en-têtes (pas de corps :
// c'est rapide). Sert à repérer les réponses à classer.
export async function lireEntrantsRecents(params: { depuis: Date; max?: number }): Promise<ReponseBrute[]> {
  const client = creerClientImap();
  await client.connect();
  const trouves: ReponseBrute[] = [];
  try {
    const verrou = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      const uids = await client.search({ since: params.depuis }, { uid: true });
      if (!uids || uids.length === 0) return [];
      for await (const m of client.fetch(uids.slice(-(params.max ?? 1500)), { ...CHAMPS, headers: [...CHAMPS.headers] }, { uid: true })) {
        const r = versReponseBrute(m as never);
        if (r) trouves.push(r);
      }
    } finally {
      verrou.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
  return trouves;
}

// Messages de toute la boîte (archives comprises) reçus depuis `depuis` des expéditeurs ou domaines
// indiqués, réduits à leurs en-têtes : pour reprendre l'existant sans lire le contenu des messages.
export async function lireEntetesParExpediteurs(params: {
  criteres: { type: "adresse" | "domaine"; valeur: string }[];
  depuis: Date;
  maxParCritere?: number;
}): Promise<ReponseBrute[]> {
  const client = creerClientImap();
  await client.connect();
  const trouves = new Map<string, ReponseBrute>();
  try {
    const boites = await client.list();
    const chemin = boites.find((b) => b.specialUse === "\\All")?.path ?? "INBOX";
    const verrou = await client.getMailboxLock(chemin, { readOnly: true });
    try {
      for (const critere of params.criteres) {
        const uids = await client.search({ from: critere.type === "domaine" ? `@${critere.valeur}` : critere.valeur, since: params.depuis }, { uid: true });
        if (!uids || uids.length === 0) continue;
        for await (const m of client.fetch(uids.slice(-(params.maxParCritere ?? 40)), { ...CHAMPS, headers: [...CHAMPS.headers] }, { uid: true })) {
          const r = versReponseBrute(m as never);
          if (r && !trouves.has(r.messageId)) trouves.set(r.messageId, r);
        }
      }
    } finally {
      verrou.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
  return [...trouves.values()];
}

// Juste après l'envoi du récapitulatif du matin (adressé à soi-même) : le range dans le dossier,
// hors de la boîte de réception. Même règle que pour un envoi : jamais bloquant.
export async function classerRecapRecu(messageId: string): Promise<void> {
  if (!dossierDisponible()) return;
  try {
    const bilan = await Promise.race([
      classerDansDossier({ recus: [messageId], reessaisRecus: 4 }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000)),
    ]);
    if (bilan && bilan.erreurs.length > 0) console.error("Classement du récapitulatif dans le dossier:", bilan.erreurs.join(" ; "));
  } catch (e) {
    console.error("Classement du récapitulatif dans le dossier impossible:", e);
  }
}
