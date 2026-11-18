// Archivage des vieux mails déjà lus de la boîte de réception. « Archiver » ne supprime rien : le mail quitte
// seulement la boîte de réception et reste dans « Tous les messages » (et dans ses autres libellés). Calcul pur ;
// la lecture et le déplacement sont dans lib/mail/archivage.ts.

export const JOURS_AVANT_ARCHIVAGE = 30;

export interface MailBoiteReception {
  lu: boolean;
  etoile: boolean;
  // Date de réception (ISO) ; sans date lisible, on ne touche pas au mail.
  date: string | null;
  // Identifiant normalisé du message (voir normaliserIdMessage).
  messageId: string | null;
  // Le mail est une réponse reçue après un message du candidat (ou un mail de candidature) ; il reste visible.
  protege?: boolean;
}

// Archivable : lu, sans étoile, reçu depuis plus de `jours` jours, et pas protégé (mail qui demande encore une action).
export function estArchivable(mail: MailBoiteReception, protegesParId: Set<string>, jours: number, maintenant = new Date()): boolean {
  if (!mail.lu || mail.etoile || mail.protege) return false;
  if (mail.messageId && protegesParId.has(mail.messageId)) return false;
  if (!mail.date) return false;
  const recu = new Date(mail.date).getTime();
  if (Number.isNaN(recu)) return false;
  return recu < maintenant.getTime() - jours * 86_400_000;
}
