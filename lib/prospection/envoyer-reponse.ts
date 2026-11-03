import type { SupabaseClient } from "@supabase/supabase-js";
import { classerEnvoiRecent } from "@/lib/mail/dossier";
import { envoyerEmail, smtpConfigure } from "@/lib/mail/smtp";
import { cleEnvoiReponse, refusEnvoiReponse, type ConseilReponse } from "@/lib/prospection/conseil-reponse";
import { premierBlocage } from "@/lib/prospection/politique";
import type { Database } from "@/types/database.types";

// Réponses envoyées sur 24 h : un garde-fou contre une rafale, pas une contrainte du quotidien.
const MAX_REPONSES_24H = 20;

export type ResultatEnvoiReponse =
  | { ok: true; destinataire: string; envoye_le: string }
  | { ok: false; erreur: string; statut: number };

const echec = (statut: number, erreur: string): ResultatEnvoiReponse => ({ ok: false, erreur, statut });

// Envoie la réponse que l'utilisateur a relue et confirmée, dans le fil de la
// conversation. Le destinataire vient du conseil enregistré, jamais du navigateur ;
// les contrôles sont refaits ici quoi qu'affiche l'interface. La ligne
// `reponses_envoyees` est créée AVANT l'envoi : la base refuse un second envoi
// simultané de la même réponse, et la trace garde le texte exact parti.
export async function envoyerReponse(
  supabase: Pick<SupabaseClient<Database>, "from">,
  userId: string,
  prospectionId: string,
  texte: { objet: string; corps: string },
): Promise<ResultatEnvoiReponse> {
  if (!smtpConfigure()) {
    return echec(501, "L'envoi n'est pas configuré : renseigne SMTP_USER et SMTP_PASSWORD dans .env.local");
  }

  const { data: prospection } = await supabase
    .from("prospections")
    .select()
    .eq("id", prospectionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prospection) return echec(404, "Message introuvable");
  if (prospection.statut !== "reponse_recue") return echec(409, "Cette candidature n'a pas de réponse enregistrée.");

  const { data: enregistre } = await supabase
    .from("conseils_reponses")
    .select("contenu, message_id, reponse_date")
    .eq("prospection_id", prospection.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!enregistre) return echec(409, "Analyse d'abord cette réponse : l'envoi s'appuie sur l'analyse enregistrée.");
  const conseil = enregistre.contenu as unknown as ConseilReponse;
  const destinataire = conseil.interlocuteur?.email?.trim() ?? "";

  const refus = refusEnvoiReponse({
    conseil,
    objet: texte.objet,
    corps: texte.corps,
    adresseUtilisateur: process.env.SMTP_USER ?? "",
  });
  if (refus) return echec(409, refus);

  const [{ data: entreprise }, { data: contact }, { data: profil }] = await Promise.all([
    supabase
      .from("entreprises")
      .select("nom, politique_candidature")
      .eq("id", prospection.entreprise_id)
      .eq("user_id", userId)
      .maybeSingle(),
    prospection.contact_id
      ? supabase.from("contacts").select().eq("id", prospection.contact_id).eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("profil").select("contact").eq("user_id", userId).maybeSingle(),
  ]);
  const blocage = entreprise ? premierBlocage(entreprise, contact) : null;
  if (blocage?.niveau === "interdit") return echec(409, `Envoi refusé : ${blocage.raison}`);

  const { count: dejaEnvoyees } = await supabase
    .from("reponses_envoyees")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if ((dejaEnvoyees ?? 0) >= MAX_REPONSES_24H) {
    return echec(429, `Limite de ${MAX_REPONSES_24H} réponses sur 24 h atteinte : reprends plus tard`);
  }

  const cle = cleEnvoiReponse({
    messageId: enregistre.message_id,
    reponseDate: enregistre.reponse_date,
    prospectionId: prospection.id,
  });
  const { data: reservation, error: reservationError } = await supabase
    .from("reponses_envoyees")
    .insert({
      user_id: userId,
      prospection_id: prospection.id,
      cle,
      destinataire,
      objet: texte.objet.trim(),
      corps: texte.corps,
    })
    .select("id")
    .single();
  if (reservationError || !reservation) {
    if (reservationError?.code === "23505") return echec(409, "Une réponse a déjà été envoyée à ce message depuis le site.");
    return echec(500, reservationError?.message ?? "Réservation de l'envoi impossible");
  }

  try {
    // Fil : notre message d'origine puis le message reçu auquel on répond (s'il est
    // connu tel qu'écrit dans la boîte mail) ; sinon on se rattache à notre message.
    const origine = prospection.parent_id ? null : prospection.smtp_message_id;
    const { messageId } = await envoyerEmail({
      a: destinataire,
      objet: texte.objet.trim(),
      corps: texte.corps,
      nomExpediteur: profil?.contact?.nom,
      references: origine ? [origine] : [],
      repondA: conseil.reponse_message_id ?? origine,
    });

    await supabase.from("reponses_envoyees").update({ smtp_message_id: messageId }).eq("id", reservation.id).eq("user_id", userId);
    await classerEnvoiRecent(messageId);
    return { ok: true, destinataire, envoye_le: new Date().toISOString() };
  } catch (e) {
    // Rien n'est parti : on libère la réponse pour qu'elle puisse être renvoyée.
    await supabase.from("reponses_envoyees").delete().eq("id", reservation.id).eq("user_id", userId);
    console.error("Erreur envoi de la réponse:", e);
    const detail = e instanceof Error ? e.message : "Erreur inconnue";
    const aide = /Invalid login|Username and Password|535/i.test(detail)
      ? " — vérifie SMTP_USER et le mot de passe d'application Gmail (pas ton mot de passe habituel)"
      : "";
    return echec(502, `L'envoi a échoué : ${detail}${aide}`);
  }
}
