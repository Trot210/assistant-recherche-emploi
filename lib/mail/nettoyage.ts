import { creerClientImap } from "@/lib/mail/imap";
import { NOM_DOSSIER } from "@/lib/mail/dossier";
import { trouverDossier, type CleDossier } from "@/lib/prospection/courrier-candidatures";
import { actionDeNettoyage, dateLimiteNettoyage, type ActionNettoyage } from "@/lib/prospection/nettoyage";
import { normaliserIdMessage } from "@/lib/prospection/reponses";

// Nettoyage des dossiers « Refus » et « En attente réponse » : les mails reçus il y a plus de 30 jours
// sont mis à la CORBEILLE de Gmail (récupérables ; Gmail les efface lui-même définitivement après
// 30 jours de plus). Ce code n'efface jamais rien définitivement et ne vide jamais la corbeille.
// Un mail aussi rangé dans « Prospection » est seulement retiré du dossier, pour rester dans
// « Prospection ». Seuls ces deux dossiers sont touchés : jamais la boîte de réception ni les envoyés.

const MAX_PAR_PASSAGE = 100;

export interface LigneNettoyage {
  dossier: string;
  action: ActionNettoyage;
  expediteur: string;
  sujet: string;
  date: string | null;
}

export interface BilanNettoyage {
  apercu: boolean;
  lignes: LigneNettoyage[];
  corbeille: number;
  retires: number;
  erreurs: string[];
}

export async function nettoyerDossiers(options: { jours: number; apercu: boolean }): Promise<BilanNettoyage> {
  const bilan: BilanNettoyage = { apercu: options.apercu, lignes: [], corbeille: 0, retires: 0, erreurs: [] };
  const limite = dateLimiteNettoyage(new Date(), options.jours);

  const client = creerClientImap();
  await client.connect();
  try {
    const boites = await client.list();
    const corbeille = boites.find((b) => b.specialUse === "\\Trash")?.path;
    const prospection = boites.find((b) => b.name === NOM_DOSSIER)?.path;

    // Messages déjà rangés dans « Prospection » : ils n'en sont pas retirés.
    const dansProspection = new Set<string>();
    if (prospection) {
      const verrou = await client.getMailboxLock(prospection, { readOnly: true });
      try {
        for await (const m of client.fetch("1:*", { envelope: true })) {
          const id = normaliserIdMessage(m.envelope?.messageId);
          if (id) dansProspection.add(id);
        }
      } catch {
        /* dossier vide : rien à lire */
      } finally {
        verrou.release();
      }
    }

    let restant = MAX_PAR_PASSAGE;
    for (const cle of ["attente", "refus"] as CleDossier[]) {
      const chemin = trouverDossier(boites, cle);
      if (!chemin || restant <= 0) continue;

      const verrou = await client.getMailboxLock(chemin, { readOnly: options.apercu });
      try {
        const uids = (await client.search({ before: limite }, { uid: true })) || [];
        if (uids.length === 0) continue;

        const aCorbeille: number[] = [];
        const aRetirer: number[] = [];
        for await (const m of client.fetch(uids.slice(0, restant), { uid: true, envelope: true }, { uid: true })) {
          const action = actionDeNettoyage(normaliserIdMessage(m.envelope?.messageId), dansProspection);
          (action === "retirer" ? aRetirer : aCorbeille).push(m.uid);
          bilan.lignes.push({
            dossier: cle === "refus" ? "Refus" : "En attente réponse",
            action,
            expediteur: m.envelope?.from?.[0]?.address ?? "?",
            sujet: m.envelope?.subject ?? "",
            date: m.envelope?.date ? new Date(m.envelope.date).toISOString().slice(0, 10) : null,
          });
        }
        restant -= aCorbeille.length + aRetirer.length;
        if (options.apercu) continue;

        if (aCorbeille.length > 0) {
          if (!corbeille) bilan.erreurs.push("Corbeille de la boîte mail introuvable : rien n'a été supprimé");
          else {
            await client.messageMove(aCorbeille, corbeille, { uid: true });
            bilan.corbeille += aCorbeille.length;
          }
        }
        if (aRetirer.length > 0) {
          // Dans un libellé Gmail, « supprimer » retire seulement le libellé : le message reste ailleurs.
          await client.messageDelete(aRetirer, { uid: true });
          bilan.retires += aRetirer.length;
        }
      } catch (e) {
        bilan.erreurs.push(e instanceof Error ? e.message : "nettoyage impossible");
      } finally {
        verrou.release();
      }
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
  return bilan;
}
