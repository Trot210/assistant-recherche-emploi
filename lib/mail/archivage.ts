import { creerClientImap } from "@/lib/mail/imap";
import { estArchivable } from "@/lib/prospection/archivage";
import { normaliserIdMessage } from "@/lib/prospection/reponses";

// Archive les vieux mails LUS de la boîte de réception : ils sont déplacés dans « Tous les messages » de Gmail,
// ce qui retire seulement le libellé « Boîte de réception ». Rien n'est supprimé, rien n'est mis à la corbeille,
// et les mails non lus ou étoilés ne sont jamais touchés. `apercu: true` liste sans rien déplacer.

const MAX_PAR_PASSAGE = 300;

export interface LigneArchivage {
  expediteur: string;
  sujet: string;
  date: string | null;
}

export interface BilanArchivage {
  apercu: boolean;
  // Nombre total de mails archivables, même au-delà de ce qui est déplacé ce coup-ci.
  total: number;
  lignes: LigneArchivage[];
  archives: number;
  erreurs: string[];
}

export async function archiverMailsLus(options: { jours: number; apercu: boolean; proteges: Set<string> }): Promise<BilanArchivage> {
  const bilan: BilanArchivage = { apercu: options.apercu, total: 0, lignes: [], archives: 0, erreurs: [] };
  const client = creerClientImap();
  await client.connect();
  try {
    const boites = await client.list();
    const toutLeCourrier = boites.find((b) => b.specialUse === "\\All")?.path;
    if (!toutLeCourrier) {
      bilan.erreurs.push("Dossier « Tous les messages » introuvable : rien n'a été archivé");
      return bilan;
    }

    const verrou = await client.getMailboxLock("INBOX", { readOnly: options.apercu });
    try {
      const limite = new Date(Date.now() - options.jours * 86_400_000);
      const uids = ((await client.search({ seen: true, before: limite }, { uid: true })) || []).slice(0, 3000);
      const aArchiver: number[] = [];
      for await (const m of client.fetch(uids, { uid: true, envelope: true, flags: true }, { uid: true })) {
        const date = m.envelope?.date ? new Date(m.envelope.date).toISOString() : null;
        const ok = estArchivable(
          {
            lu: m.flags?.has("\\Seen") ?? false,
            etoile: m.flags?.has("\\Flagged") ?? false,
            date,
            messageId: normaliserIdMessage(m.envelope?.messageId),
          },
          options.proteges,
          options.jours,
        );
        if (!ok) continue;
        bilan.total += 1;
        if (aArchiver.length >= MAX_PAR_PASSAGE) continue;
        aArchiver.push(m.uid);
        bilan.lignes.push({ expediteur: m.envelope?.from?.[0]?.address ?? "?", sujet: m.envelope?.subject ?? "", date: date?.slice(0, 10) ?? null });
      }
      if (!options.apercu && aArchiver.length > 0) {
        await client.messageMove(aArchiver, toutLeCourrier, { uid: true });
        bilan.archives = aArchiver.length;
      }
    } catch (e) {
      bilan.erreurs.push(e instanceof Error ? e.message : "archivage impossible");
    } finally {
      verrou.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
  return bilan;
}
