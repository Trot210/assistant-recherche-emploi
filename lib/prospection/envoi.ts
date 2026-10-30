import type { SupabaseClient } from "@supabase/supabase-js";
import { envoyerEmail, smtpConfigure } from "@/lib/mail/smtp";
import { libelleCv, lireCvReference, nomPieceJointeCv } from "@/lib/prospection/cv";
import { premierBlocage } from "@/lib/prospection/politique";
import { appliquerAction, aujourdhuiParis } from "@/lib/prospection/workflow";
import type { Database } from "@/types/database.types";
import type { Prospection } from "@/types/prospection";

// Plafond d'envois par jour pour un envoi manuel : au-delà, un compte personnel est
// vite signalé comme expéditeur de masse, ce qui va à l'encontre de candidatures
// ciblées. Les envois programmés appliquent un plafond plus strict (réglable).
export const MAX_ENVOIS_PAR_JOUR_MANUEL = 20;

export type CodeErreurEnvoi =
  | "non_configure"
  | "introuvable"
  | "statut"
  | "sans_destinataire"
  | "bloque"
  | "limite"
  | "cv_manquant"
  | "reserve"
  | "smtp";

export type ResultatEnvoi =
  | { ok: true; prospection: Prospection; pieceJointe: string | null }
  | { ok: false; erreur: string; statut: number; code: CodeErreurEnvoi };

export interface OptionsEnvoi {
  joindreCv?: boolean;
  maxParJour?: number;
}

const echec = (code: CodeErreurEnvoi, statut: number, erreur: string): ResultatEnvoi => ({ ok: false, erreur, statut, code });

// Envoie réellement un message validé depuis la boîte de l'utilisateur. Un seul chemin
// pour l'envoi manuel et pour l'envoi programmé : mêmes contrôles, même protection
// contre le double envoi, même mise à jour de statut. Le message est « réservé »
// (statut envoyé) AVANT l'envoi : un deuxième appel, un deuxième onglet ou une
// deuxième exécution ne trouve plus le statut attendu et ne peut pas l'envoyer deux fois.
export async function envoyerProspection(
  supabase: SupabaseClient<Database>,
  userId: string,
  prospectionId: string,
  options: OptionsEnvoi = {},
): Promise<ResultatEnvoi> {
  if (!smtpConfigure()) {
    return echec("non_configure", 501, "L'envoi n'est pas configuré : renseigne SMTP_USER et SMTP_PASSWORD dans .env.local");
  }

  const { data: prospection, error } = await supabase
    .from("prospections")
    .select()
    .eq("id", prospectionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return echec("introuvable", 500, error.message);
  if (!prospection) return echec("introuvable", 404, "Message introuvable");

  const aujourdhui = aujourdhuiParis();

  let parent: Prospection | null = null;
  if (prospection.parent_id) {
    const { data } = await supabase
      .from("prospections")
      .select()
      .eq("id", prospection.parent_id)
      .eq("user_id", userId)
      .maybeSingle();
    parent = data;
  }

  // Les règles de statut sont celles de « J'ai envoyé ce message » : un message non
  // validé est refusé ici, avant toute tentative d'envoi.
  const transition = appliquerAction(prospection, parent, "marquer_envoyee", aujourdhui);
  if ("erreur" in transition) return echec("statut", 409, transition.erreur);

  const [{ data: contact }, { data: profil }] = await Promise.all([
    prospection.contact_id
      ? supabase.from("contacts").select().eq("id", prospection.contact_id).eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("profil").select("contact").eq("user_id", userId).maybeSingle(),
  ]);

  if (!contact?.email) return echec("sans_destinataire", 400, "Ce message n'a pas de destinataire avec une adresse e-mail");

  // Une adresse qui a rebondi, une personne ou une entreprise qui a demandé à ne plus
  // être contactée : l'envoi est refusé même si le brouillon existe déjà.
  const { data: entreprise } = await supabase
    .from("entreprises")
    .select("nom, politique_candidature")
    .eq("id", prospection.entreprise_id)
    .eq("user_id", userId)
    .maybeSingle();
  const blocage = entreprise ? premierBlocage(entreprise, contact) : null;
  if (blocage?.niveau === "interdit") return echec("bloque", 409, `Envoi refusé : ${blocage.raison}`);

  const maxParJour = options.maxParJour ?? MAX_ENVOIS_PAR_JOUR_MANUEL;
  const { count: envoyesAujourdhui } = await supabase
    .from("prospections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("date_envoi", aujourdhui)
    .in("statut", ["envoyee", "reponse_recue", "sans_suite"]);
  if ((envoyesAujourdhui ?? 0) >= maxParJour) {
    return echec("limite", 429, `Limite de ${maxParJour} envois par jour atteinte : reprends demain`);
  }

  let pieceJointe;
  if (options.joindreCv ?? true) {
    // Le CV joint suit la langue du message : jamais le CV français sous un message
    // anglais (ni l'inverse).
    const cv = await lireCvReference(supabase, userId, prospection.langue);
    if (!cv) {
      return echec("cv_manquant", 409, `Aucun ${libelleCv(prospection.langue).toLowerCase()} n'est enregistré : ajoute-le avant d'envoyer`);
    }
    pieceJointe = { nomFichier: nomPieceJointeCv(profil?.contact?.nom, prospection.langue), contenu: cv.contenu };
  }

  const maintenant = new Date().toISOString();
  const { data: reserve, error: reserveError } = await supabase
    .from("prospections")
    .update({ ...transition.message, updated_at: maintenant })
    .eq("id", prospection.id)
    .eq("user_id", userId)
    .eq("statut", prospection.statut)
    .select()
    .maybeSingle();

  if (reserveError) return echec("reserve", 500, reserveError.message);
  if (!reserve) return echec("reserve", 409, "Ce message est déjà en cours d'envoi ou a déjà été envoyé");

  try {
    const { messageId } = await envoyerEmail({
      a: contact.email,
      objet: prospection.objet,
      corps: prospection.corps,
      nomExpediteur: profil?.contact?.nom,
      pieceJointe,
      repondA: parent?.smtp_message_id,
    });

    const { data: envoye } = await supabase
      .from("prospections")
      .update({ smtp_message_id: messageId })
      .eq("id", prospection.id)
      .eq("user_id", userId)
      .select()
      .single();

    if (transition.parent && parent) {
      await supabase
        .from("prospections")
        .update({ ...transition.parent, updated_at: maintenant })
        .eq("id", parent.id)
        .eq("user_id", userId);
    }

    return { ok: true, prospection: envoye ?? reserve, pieceJointe: pieceJointe?.nomFichier ?? null };
  } catch (e) {
    // L'envoi a échoué : on remet le message dans son état d'avant pour qu'il reste
    // modifiable et renvoyable.
    await supabase
      .from("prospections")
      .update({
        statut: prospection.statut,
        date_envoi: prospection.date_envoi,
        prochaine_relance: prospection.prochaine_relance,
        updated_at: new Date().toISOString(),
      })
      .eq("id", prospection.id)
      .eq("user_id", userId);

    console.error("Erreur envoi e-mail:", e);
    const detail = e instanceof Error ? e.message : "Erreur inconnue";
    const aide = /Invalid login|Username and Password|535/i.test(detail)
      ? " — vérifie SMTP_USER et le mot de passe d'application Gmail (pas ton mot de passe habituel)"
      : "";
    return echec("smtp", 502, `L'envoi a échoué : ${detail}${aide}`);
  }
}
