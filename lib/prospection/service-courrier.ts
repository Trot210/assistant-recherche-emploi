import type { SupabaseClient } from "@supabase/supabase-js";
import { classerCourrierCandidature } from "@/lib/anthropic/courrier-candidature";
import { lireCandidatsBoite, rangerCourrier, type BilanDossier, type CourrierLu } from "@/lib/mail/dossier";
import { courrierARanger, debutDuTri, type CleDossier, type NatureCourrier } from "@/lib/prospection/courrier-candidatures";
import { rapprocher, type EnvoiConnu } from "@/lib/prospection/reponses";
import type { Database } from "@/types/database.types";

// Tri des mails de candidature : lecture (Claude), mémoire en base, puis rangement dans « En attente
// réponse » et « Refus ». Deux temps séparés : analyser ne touche à aucun mail ; ranger déplace ce
// qui a été analysé.

const CONCURRENCE = 3;

export interface LigneCourrier {
  expediteur: string;
  sujet: string;
  nature: NatureCourrier;
  resume: string;
  date: string | null;
  prospection: boolean;
}

export interface BilanAnalyse {
  lignes: LigneCourrier[];
  // Mails de candidature repérés mais pas encore lus (limite par passage ou plafond Claude).
  restants: number;
}

async function envoisConnus(supabase: SupabaseClient<Database>, userId: string): Promise<EnvoiConnu[]> {
  const [{ data: prospections }, { data: contacts }] = await Promise.all([
    supabase.from("prospections").select("id, parent_id, smtp_message_id, date_envoi, contact_id").eq("user_id", userId).not("date_envoi", "is", null),
    supabase.from("contacts").select("id, email").eq("user_id", userId),
  ]);
  const emailContact = new Map((contacts ?? []).map((c) => [c.id, c.email]));
  return (prospections ?? []).map((p) => ({
    id: p.id,
    parentId: p.parent_id,
    smtpMessageId: p.smtp_message_id,
    emailContact: p.contact_id ? (emailContact.get(p.contact_id) ?? null) : null,
    dateEnvoi: p.date_envoi as string,
  }));
}

// Lit les mails de candidature pas encore classés, les fait lire par Claude (`max` au plus par appel) et
// mémorise le résultat. L'appelant a ouvert le suivi du coût Claude. Aucun mail n'est déplacé.
export async function analyserCourrier(
  supabase: SupabaseClient<Database>,
  userId: string,
  options: { jours: number; max: number; claudeDisponible: boolean; avecProspection?: boolean },
): Promise<BilanAnalyse> {
  if (!options.claudeDisponible) return { lignes: [], restants: 0 };

  const { data: connus, error: erreurMemoire } = await supabase.from("courrier_candidatures").select("message_id").eq("user_id", userId);
  // Sans la table, chaque lecture serait payée pour rien : on s'arrête avant d'appeler Claude.
  if (erreurMemoire) throw new Error("La mémoire des mails de candidature est indisponible (migration 0025 à appliquer dans Supabase)");
  const dejaLus = new Set((connus ?? []).map((c) => c.message_id));
  const moi = process.env.IMAP_USER ?? process.env.SMTP_USER ?? "";
  // Jamais avant la date de début du tri : l'existant n'est pas touché.
  const depuis = debutDuTri(options.jours);

  let lus: CourrierLu[] = [];
  let restants = 0;
  const boites: ("inbox" | "prospection")[] = options.avecProspection ? ["inbox", "prospection"] : ["inbox"];
  for (const boite of boites) {
    const place = options.max - lus.length;
    if (place <= 0) {
      restants += 1;
      break;
    }
    const lecture = await lireCandidatsBoite({ boite, depuis, adresseUtilisateur: moi, dejaLus, max: place });
    for (const l of lecture.lus) dejaLus.add(l.messageId);
    lus = lus.concat(lecture.lus);
    restants += lecture.restants;
  }
  if (lus.length === 0) return { lignes: [], restants };

  const envois = await envoisConnus(supabase, userId);
  const lignes: LigneCourrier[] = [];
  const aMemoriser: Database["public"]["Tables"]["courrier_candidatures"]["Insert"][] = [];

  const traiter = async (c: CourrierLu) => {
    try {
      const { nature, resume } = await classerCourrierCandidature({ expediteur: c.fromEmail, sujet: c.sujet, texte: c.texte });
      const lie = rapprocher(
        { messageId: c.messageId, inReplyTo: c.inReplyTo, references: c.references, fromEmail: c.fromEmail, fromNom: c.fromNom, date: c.date, sujet: c.sujet, texte: "" },
        envois,
      );
      aMemoriser.push({
        user_id: userId,
        message_id: c.messageId,
        message_id_brut: c.messageIdBrut,
        nature,
        expediteur: `${c.fromNom ? `${c.fromNom} ` : ""}<${c.fromEmail}>`.slice(0, 200),
        sujet: c.sujet.slice(0, 200),
        resume,
        date_mail: c.date.toISOString(),
        prospection_id: lie?.prospectionId ?? null,
      });
      lignes.push({ expediteur: c.fromNom ?? c.fromEmail, sujet: c.sujet, nature, resume, date: c.date.toISOString().slice(0, 10), prospection: lie !== null });
    } catch (e) {
      // Un message qui n'a pas pu être lu est simplement retenté au passage suivant.
      console.error("Lecture d'un mail de candidature impossible:", e);
      restants += 1;
    }
  };
  for (let i = 0; i < lus.length; i += CONCURRENCE) await Promise.all(lus.slice(i, i + CONCURRENCE).map(traiter));

  if (aMemoriser.length > 0) {
    const { error } = await supabase.from("courrier_candidatures").upsert(aMemoriser, { onConflict: "user_id,message_id" });
    if (error) console.error("Mémorisation des mails de candidature impossible:", error.message);
  }
  return { lignes, restants };
}

export interface BilanRangement {
  aRanger: { attente: number; refus: number };
  ranges: number;
  bilan: BilanDossier | null;
}

// Classés comme accusé de réception ou refus et pas encore rangés : `apercu` les compte, sinon les
// déplace (jamais plus de 60 par passage).
export async function rangerCourrierAnalyse(supabase: SupabaseClient<Database>, userId: string, options: { apercu: boolean }): Promise<BilanRangement> {
  const { data: lignes } = await supabase
    .from("courrier_candidatures")
    .select("message_id, message_id_brut, nature, deplace_at, prospection_id")
    .eq("user_id", userId)
    .is("deplace_at", null)
    .in("nature", ["accuse_reception", "refus"])
    .limit(60);

  const aRanger = courrierARanger((lignes ?? []).map((l) => ({ message_id_brut: l.message_id_brut, nature: l.nature, deplace_at: l.deplace_at, prospection_id: l.prospection_id })));
  const compte = { attente: aRanger.filter((r) => r.dossier === "attente").length, refus: aRanger.filter((r) => r.dossier === "refus").length };
  if (options.apercu || aRanger.length === 0) return { aRanger: compte, ranges: 0, bilan: null };

  const plan = (["attente", "refus"] as CleDossier[]).map((dossier) => ({
    dossier,
    ids: aRanger.filter((r) => r.dossier === dossier).map((r) => r.messageIdBrut),
    aussiProspection: new Set(aRanger.filter((r) => r.dossier === dossier && r.liaison).map((r) => r.messageIdBrut)),
  }));
  const { ranges, bilan } = await rangerCourrier(plan);

  const maintenant = new Date().toISOString();
  const rangesSet = new Set(ranges);
  const ids = (lignes ?? []).filter((l) => l.message_id_brut && rangesSet.has(l.message_id_brut)).map((l) => l.message_id);
  if (ids.length > 0) {
    await supabase.from("courrier_candidatures").update({ deplace_at: maintenant }).eq("user_id", userId).in("message_id", ids);
  }
  return { aRanger: compte, ranges: ranges.length, bilan };
}
