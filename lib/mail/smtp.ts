import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";

// Envoi par SMTP depuis la propre adresse de l'utilisateur (Gmail par défaut,
// avec un « mot de passe d'application » : pas de Google Cloud ni d'OAuth).
// Gmail range lui-même le message dans « Envoyés » et les réponses arrivent
// dans la boîte de l'utilisateur.
export interface MessageSortant {
  a: string;
  objet: string;
  corps: string;
  nomExpediteur?: string | null;
  pieceJointe?: { nomFichier: string; contenu: Buffer };
  // Identifiant du message d'origine, pour qu'une relance s'affiche dans le même fil.
  repondA?: string | null;
}

export function smtpConfigure(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

export class SmtpNonConfigure extends Error {
  constructor() {
    super("L'envoi n'est pas configuré : renseigne SMTP_USER et SMTP_PASSWORD dans .env.local");
    this.name = "SmtpNonConfigure";
  }
}

// Un saut de ligne dans un en-tête permettrait d'injecter un destinataire
// caché (Bcc:) : on refuse plutôt que de nettoyer en silence.
function refuserSautsDeLigne(nom: string, valeur: string) {
  if (/[\r\n]/.test(valeur)) throw new Error(`${nom} ne peut pas contenir de saut de ligne`);
}

// Construit le message sans l'envoyer : testable sans réseau.
export function construireOptions(message: MessageSortant, expediteur: string): Mail.Options {
  refuserSautsDeLigne("Le destinataire", message.a);
  refuserSautsDeLigne("L'objet", message.objet);
  if (message.repondA) refuserSautsDeLigne("L'identifiant du fil", message.repondA);

  return {
    from: message.nomExpediteur
      ? { name: message.nomExpediteur.replace(/[\r\n"]/g, " ").trim(), address: expediteur }
      : expediteur,
    to: message.a,
    subject: message.objet,
    text: message.corps,
    ...(message.repondA ? { inReplyTo: message.repondA, references: message.repondA } : {}),
    ...(message.pieceJointe
      ? {
          attachments: [
            { filename: message.pieceJointe.nomFichier, content: message.pieceJointe.contenu, contentType: "application/pdf" },
          ],
        }
      : {}),
  };
}

export async function envoyerEmail(message: MessageSortant): Promise<{ messageId: string }> {
  const utilisateur = process.env.SMTP_USER;
  const motDePasse = process.env.SMTP_PASSWORD;
  if (!utilisateur || !motDePasse) throw new SmtpNonConfigure();

  const port = Number(process.env.SMTP_PORT ?? 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user: utilisateur, pass: motDePasse },
    connectionTimeout: 15_000,
    socketTimeout: 30_000,
  });

  const options = construireOptions(message, utilisateur);
  const info = await transport.sendMail(options);

  if (info.rejected.length > 0) {
    throw new Error(`Le serveur a refusé le destinataire : ${info.rejected.join(", ")}`);
  }
  return { messageId: info.messageId };
}
