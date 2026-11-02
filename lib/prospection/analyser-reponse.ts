import type { SupabaseClient } from "@supabase/supabase-js";
import { conseillerSurReponse, type ReponseRecue } from "@/lib/anthropic/conseil-reponse";
import { ImapNonConfigure, imapConfigure, lireReponsesCandidates } from "@/lib/mail/imap";
import { choisirReponse, type ConseilReponse } from "@/lib/prospection/conseil-reponse";
import {
  critereRecherche,
  estExpediteurAutomatique,
  rapprocher,
  texteDeLaReponse,
  type EnvoiConnu,
} from "@/lib/prospection/reponses";
import type { Database, Json } from "@/types/database.types";
import type { Prospection } from "@/types/prospection";

const JOURS_DE_RECUL = 1;

export type ResultatConseil =
  | { erreur: string; statut: number }
  | { conseil: ConseilReponse; reponse_date: string | null; avis: string | null; enregistre: boolean };

// Analyse la réponse déjà enregistrée sur une candidature : le message complet est
// relu dans la boîte mail en lecture seule (la candidature ne garde qu'un court
// extrait). Rien n'est envoyé ni modifié ailleurs que dans le conseil mémorisé.
// L'appelant a vérifié le propriétaire, le statut et le plafond de coût Claude.
export async function analyserReponse(
  supabase: SupabaseClient<Database>,
  userId: string,
  prospection: Prospection,
): Promise<ResultatConseil> {
  const [{ data: profil }, { data: entreprise }, { data: contact }, { data: fil }, { data: associees }] = await Promise.all([
    supabase.from("profil").select().eq("user_id", userId).maybeSingle(),
    supabase.from("entreprises").select().eq("id", prospection.entreprise_id).eq("user_id", userId).maybeSingle(),
    prospection.contact_id
      ? supabase.from("contacts").select().eq("id", prospection.contact_id).eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("prospections")
      .select("id, parent_id, smtp_message_id, date_envoi")
      .eq("user_id", userId)
      .or(`id.eq.${prospection.id},parent_id.eq.${prospection.id}`)
      .not("date_envoi", "is", null),
    supabase
      .from("reponses_traitees")
      .select("message_id")
      .eq("user_id", userId)
      .eq("prospection_id", prospection.id)
      .eq("decision", "associee"),
  ]);

  if (!profil) return { erreur: "Profil non renseigné", statut: 400 };
  if (!entreprise) return { erreur: "Entreprise introuvable", statut: 404 };

  // 1. Le message complet, relu dans la boîte mail (lecture seule).
  let reponse: ReponseRecue | null = null;
  let messageId: string | null = null;
  let avisLecture: string | null = null;

  const critere = contact?.email ? critereRecherche(contact.email) : null;
  if (critere && imapConfigure()) {
    const envois: EnvoiConnu[] = (fil ?? []).map((p) => ({
      id: p.id,
      parentId: p.parent_id,
      smtpMessageId: p.smtp_message_id,
      emailContact: contact?.email ?? null,
      dateEnvoi: p.date_envoi as string,
    }));
    const premierEnvoi = envois.reduce((min, e) => (e.dateEnvoi < min ? e.dateEnvoi : min), prospection.date_envoi ?? "9999-12-31");
    try {
      const lues = await lireReponsesCandidates({
        criteres: [critere],
        depuis: new Date(new Date(`${premierEnvoi}T00:00:00Z`).getTime() - JOURS_DE_RECUL * 86_400_000),
        adresseUtilisateur: process.env.IMAP_USER ?? process.env.SMTP_USER ?? "",
        maxParCritere: 40,
      });
      // Uniquement des messages de personnes rattachés à CETTE candidature.
      const candidates = lues.filter(
        (r) => !estExpediteurAutomatique(r.fromEmail) && rapprocher(r, envois)?.prospectionId === prospection.id,
      );
      const choisie = choisirReponse(candidates, {
        reponseDate: prospection.reponse_date,
        messageIdsConnus: (associees ?? []).map((a) => a.message_id),
      });
      if (choisie) {
        messageId = choisie.messageId;
        reponse = {
          expediteurNom: choisie.fromNom,
          expediteurEmail: choisie.fromEmail,
          sujet: choisie.sujet,
          texte: texteDeLaReponse(choisie.texte),
          date: choisie.date.toISOString().slice(0, 10),
        };
      } else {
        avisLecture = "Le message n'a pas été retrouvé dans la boîte mail : l'analyse porte sur l'extrait enregistré.";
      }
    } catch (e) {
      console.error("Lecture de la réponse impossible:", e);
      avisLecture = `Lecture de la boîte mail impossible (${e instanceof Error ? e.message : "erreur inconnue"}) : l'analyse porte sur l'extrait enregistré.`;
    }
  } else if (critere && !imapConfigure()) {
    avisLecture = `${new ImapNonConfigure().message}. L'analyse porte sur l'extrait enregistré.`;
  } else {
    avisLecture = "Pas d'adresse de contact sur cette candidature : l'analyse porte sur l'extrait enregistré.";
  }

  // 2. Repli : l'extrait enregistré avec la réponse.
  if (!reponse) {
    const extrait = prospection.reponse_extrait?.trim();
    if (!extrait) {
      return { erreur: `${avisLecture ?? "Réponse introuvable."} Aucun extrait n'est enregistré : impossible d'analyser.`, statut: 422 };
    }
    reponse = {
      expediteurNom: contact?.nom ?? null,
      expediteurEmail: contact?.email ?? "",
      sujet: "",
      texte: extrait,
      date: prospection.reponse_date ?? prospection.date_envoi ?? "",
    };
  }

  try {
    const conseil = await conseillerSurReponse({
      profil,
      entreprise,
      contact,
      prospection,
      reponse,
      source: messageId ? "message" : "extrait",
    });

    const { error: enregistrementError } = await supabase.from("conseils_reponses").upsert(
      {
        user_id: userId,
        prospection_id: prospection.id,
        message_id: messageId,
        reponse_date: reponse.date || null,
        contenu: conseil as unknown as Json,
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_id,prospection_id" },
    );
    if (enregistrementError) console.error("Enregistrement du conseil impossible:", enregistrementError.message);

    // `avis` prévient quand l'analyse n'a pas pu se faire sur le message complet.
    return { conseil, reponse_date: reponse.date || null, avis: avisLecture, enregistre: !enregistrementError };
  } catch (e) {
    console.error("Erreur analyse de la réponse:", e);
    return { erreur: "L'analyse de la réponse a échoué. Réessaie dans un instant.", statut: 502 };
  }
}
