import { construireMime, versBase64Url, type PieceJointe } from "@/lib/gmail/mime";

// Un seul compte Gmail (celui du candidat), authentifié par refresh token
// généré une fois (voir .env.example). Seule la portée « gmail.compose » est
// demandée : l'application peut créer des brouillons, jamais lire la boîte
// ni envoyer à ta place — l'envoi reste un clic dans Gmail.
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRAFTS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/drafts";

export class GmailNonConfigure extends Error {
  constructor() {
    super(
      "Gmail n'est pas configuré : renseigne GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET et GMAIL_REFRESH_TOKEN dans .env.local",
    );
    this.name = "GmailNonConfigure";
  }
}

export function gmailConfigure(): boolean {
  return Boolean(
    process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN,
  );
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  if (!gmailConfigure()) throw new GmailNonConfigure();

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    // "invalid_grant" = refresh token révoqué ou expiré : cas typique d'une
    // appli Google restée en mode « Test » (expiration au bout de 7 jours).
    const aide = detail.includes("invalid_grant")
      ? " — le refresh token a expiré ou été révoqué ; régénère-le (une appli Google en mode « Test » expire tous les 7 jours : passe-la en « Production »)"
      : "";
    throw new Error(`Authentification Gmail refusée (${res.status})${aide}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cachedToken.value;
}

export interface BrouillonGmail {
  draftId: string;
  messageId: string;
  threadId: string;
  lien: string;
}

export async function creerBrouillon(params: {
  a: string;
  objet: string;
  corps: string;
  pieceJointe?: PieceJointe;
  // Pour qu'une relance s'ajoute au fil du message initial.
  threadId?: string | null;
}): Promise<BrouillonGmail> {
  const token = await getAccessToken();
  const raw = versBase64Url(construireMime(params));

  const res = await fetch(DRAFTS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: { raw, ...(params.threadId ? { threadId: params.threadId } : {}) },
    }),
  });

  if (!res.ok) {
    throw new Error(`Création du brouillon Gmail impossible (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { id: string; message: { id: string; threadId: string } };
  return {
    draftId: data.id,
    messageId: data.message.id,
    threadId: data.message.threadId,
    lien: `https://mail.google.com/mail/u/0/#drafts?compose=${data.message.id}`,
  };
}
