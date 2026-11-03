import type { SupabaseClient } from "@supabase/supabase-js";
import { classerDansDossier, lireEntetesParExpediteurs, lireEntrantsRecents, type BilanDossier } from "@/lib/mail/dossier";
import { critereRecherche, rapprocher, type CritereRecherche, type EnvoiConnu, type ReponseBrute } from "@/lib/prospection/reponses";
import { estSujetRecap } from "@/lib/prospection/recap";
import { ajouterJours, aujourdhuiParis } from "@/lib/prospection/workflow";
import type { Database } from "@/types/database.types";

// Classe automatiquement la prospection dans le dossier « Prospection » de la boîte mail :
// les messages envoyés par le site (copiés) et les réponses reçues (déplacées hors de la
// boîte de réception). Un message est « de la prospection » seulement si l'application l'a
// rattaché à une candidature (en-têtes de réponse, adresse du contact, domaine de
// l'entreprise) : les autres e-mails ne sont jamais touchés.

export interface ReponseAClasser {
  message: ReponseBrute;
  prospectionId: string;
}

// Parmi les messages reçus, ceux qui répondent à la prospection (réponse directe, même adresse
// que le contact, même entreprise), sans jamais prendre un message envoyé par l'utilisateur.
export function choisirRecusAClasser(entrants: ReponseBrute[], envois: EnvoiConnu[], adresseUtilisateur: string): ReponseAClasser[] {
  const moi = adresseUtilisateur.trim().toLowerCase();
  const vus = new Set<string>();
  const choisis: ReponseAClasser[] = [];
  for (const m of entrants) {
    if (!m.messageIdBrut || vus.has(m.messageId) || m.fromEmail.trim().toLowerCase() === moi) continue;
    const rapprochement = rapprocher(m, envois);
    if (!rapprochement) continue;
    vus.add(m.messageId);
    choisis.push({ message: m, prospectionId: rapprochement.prospectionId });
  }
  return choisis;
}

// Récapitulatifs du matin que le site s'est envoyés à lui-même : ils concernent la prospection, ils
// vont dans le même dossier. Reconnus à l'expéditeur (soi) et à leur objet exact.
export function choisirRecapsAClasser(entrants: ReponseBrute[], adresseUtilisateur: string): ReponseBrute[] {
  const moi = adresseUtilisateur.trim().toLowerCase();
  const vus = new Set<string>();
  return entrants.filter((m) => {
    if (!m.messageIdBrut || vus.has(m.messageId) || m.fromEmail.trim().toLowerCase() !== moi || !estSujetRecap(m.sujet)) return false;
    vus.add(m.messageId);
    return true;
  });
}

export interface LigneApercu {
  sens: "recu" | "envoye" | "recap";
  entreprise: string;
  detail: string;
  date: string | null;
}

export interface ResultatClassement {
  apercu: boolean;
  nbRecus: number;
  nbRecaps: number;
  nbEnvoyes: number;
  lignes: LigneApercu[];
  bilan: BilanDossier | null;
}

interface Options {
  // Ne regarder que les messages des `jours` derniers jours (passage régulier) ou, pour la
  // reprise de l'existant, toute la prospection (boîte entière, archives comprises).
  jours: number;
  toutes?: boolean;
  // Aperçu : dit ce qui serait classé, sans rien modifier dans la boîte mail.
  apercu: boolean;
  // Copier aussi les messages envoyés (défaut : oui). Un passage fréquent ne s'occupe que des réponses :
  // chaque envoi est déjà copié dans le dossier au moment où il part.
  envoyes?: boolean;
}

export async function classerEchanges(supabase: SupabaseClient<Database>, userId: string, options: Options): Promise<ResultatClassement> {
  const [{ data: prospections }, { data: contacts }, { data: entreprises }, { data: reponsesEnvoyees }] = await Promise.all([
    supabase.from("prospections").select("id, parent_id, smtp_message_id, date_envoi, contact_id, entreprise_id").eq("user_id", userId).not("date_envoi", "is", null),
    supabase.from("contacts").select("id, email").eq("user_id", userId),
    supabase.from("entreprises").select("id, nom").eq("user_id", userId),
    supabase.from("reponses_envoyees").select("smtp_message_id, prospection_id, created_at").eq("user_id", userId).not("smtp_message_id", "is", null),
  ]);

  const emailContact = new Map((contacts ?? []).map((c) => [c.id, c.email]));
  const nomEntreprise = new Map((entreprises ?? []).map((e) => [e.id, e.nom]));
  const lignePar = new Map((prospections ?? []).map((p) => [p.id, p]));
  const envois: EnvoiConnu[] = (prospections ?? []).map((p) => ({
    id: p.id,
    parentId: p.parent_id,
    smtpMessageId: p.smtp_message_id,
    emailContact: p.contact_id ? (emailContact.get(p.contact_id) ?? null) : null,
    dateEnvoi: p.date_envoi as string,
  }));
  const moi = process.env.IMAP_USER ?? process.env.SMTP_USER ?? "";
  const entrepriseDe = (prospectionId: string | null) => {
    const p = prospectionId ? lignePar.get(prospectionId) : undefined;
    return p ? (nomEntreprise.get(p.entreprise_id) ?? "Entreprise") : "Entreprise";
  };

  // 1. Messages envoyés à copier : ceux des derniers jours, ou tous.
  const depuisJour = ajouterJours(aujourdhuiParis(), -options.jours);
  const envoyes: { id: string; entreprise: string; date: string | null }[] = [];
  for (const p of options.envoyes === false ? [] : (prospections ?? [])) {
    if (!p.smtp_message_id || (!options.toutes && (p.date_envoi as string) < depuisJour)) continue;
    envoyes.push({ id: p.smtp_message_id, entreprise: entrepriseDe(p.id), date: p.date_envoi });
  }
  for (const r of options.envoyes === false ? [] : (reponsesEnvoyees ?? [])) {
    if (!r.smtp_message_id || (!options.toutes && r.created_at.slice(0, 10) < depuisJour)) continue;
    envoyes.push({ id: r.smtp_message_id, entreprise: entrepriseDe(r.prospection_id), date: r.created_at.slice(0, 10) });
  }

  // 2. Réponses reçues à déplacer.
  const depuis = new Date(`${depuisJour}T00:00:00Z`);
  let entrants: ReponseBrute[];
  if (options.toutes) {
    const criteres = new Map<string, CritereRecherche>();
    for (const e of envois) {
      const c = e.emailContact ? critereRecherche(e.emailContact) : null;
      if (c) criteres.set(`${c.type}:${c.valeur}`, c);
    }
    entrants = criteres.size === 0 ? [] : await lireEntetesParExpediteurs({ criteres: [...criteres.values()], depuis });
  } else {
    entrants = await lireEntrantsRecents({ depuis });
  }
  const recus = choisirRecusAClasser(entrants, envois, moi);
  // Les récapitulatifs sont dans la boîte de réception : en reprise de l'existant, on la lit aussi
  // (en-têtes seulement), car la lecture par expéditeurs ci-dessus ne les voit pas.
  const entrantsRecaps = options.toutes ? await lireEntrantsRecents({ depuis }) : entrants;
  const recaps = choisirRecapsAClasser(entrantsRecaps, moi);

  const lignes: LigneApercu[] = [
    ...recus.map((r) => ({ sens: "recu" as const, entreprise: entrepriseDe(r.prospectionId), detail: `${r.message.fromNom ?? r.message.fromEmail} — ${r.message.sujet || "(sans objet)"}`, date: r.message.date.toISOString().slice(0, 10) })),
    ...recaps.map((m) => ({ sens: "recap" as const, entreprise: "Récapitulatif du matin", detail: m.sujet, date: m.date.toISOString().slice(0, 10) })),
    ...envoyes.map((e) => ({ sens: "envoye" as const, entreprise: e.entreprise, detail: "message envoyé", date: e.date })),
  ];
  const resultat: ResultatClassement = { apercu: options.apercu, nbRecus: recus.length, nbRecaps: recaps.length, nbEnvoyes: envoyes.length, lignes, bilan: null };
  if (options.apercu || (recus.length === 0 && recaps.length === 0 && envoyes.length === 0)) return resultat;

  resultat.bilan = await classerDansDossier({ envoyes: envoyes.map((e) => e.id), recus: [...recus.map((r) => r.message.messageIdBrut as string), ...recaps.map((m) => m.messageIdBrut as string)] });
  return resultat;
}
