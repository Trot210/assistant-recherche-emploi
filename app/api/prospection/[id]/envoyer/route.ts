import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { envoyerEmail, smtpConfigure } from "@/lib/mail/smtp";
import { lireCvReference, nomPieceJointeCv } from "@/lib/prospection/cv";
import { appliquerAction, aujourdhuiParis } from "@/lib/prospection/workflow";

// Plafond d'envois par jour : au-delà, un compte personnel est vite signalé
// comme expéditeur de masse, ce qui va à l'encontre de candidatures ciblées.
const MAX_ENVOIS_PAR_JOUR = 20;

// Envoie réellement le message depuis la boîte de l'utilisateur. Rien ne part
// sans une confirmation explicite dans la requête : l'interface la demande
// après l'affichage du destinataire, du texte et de la pièce jointe.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (body?.confirme !== true) {
    return NextResponse.json({ error: "Confirme l'envoi après avoir vérifié le message" }, { status: 400 });
  }
  if (!smtpConfigure()) {
    return NextResponse.json(
      { error: "L'envoi n'est pas configuré : renseigne SMTP_USER et SMTP_PASSWORD dans .env.local", smtp_non_configure: true },
      { status: 501 },
    );
  }

  const { data: prospection, error } = await supabase
    .from("prospections")
    .select()
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!prospection) return NextResponse.json({ error: "Message introuvable" }, { status: 404 });

  const aujourdhui = aujourdhuiParis();

  let parent = null;
  if (prospection.parent_id) {
    const { data } = await supabase
      .from("prospections")
      .select()
      .eq("id", prospection.parent_id)
      .eq("user_id", user.id)
      .maybeSingle();
    parent = data;
  }

  // Les règles de statut sont celles de « J'ai envoyé ce message » : un
  // message non validé est refusé ici, avant toute tentative d'envoi.
  const transition = appliquerAction(prospection, parent, "marquer_envoyee", aujourdhui);
  if ("erreur" in transition) {
    return NextResponse.json({ error: transition.erreur }, { status: 409 });
  }

  const [{ data: contact }, { data: profil }] = await Promise.all([
    prospection.contact_id
      ? supabase.from("contacts").select().eq("id", prospection.contact_id).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("profil").select("contact").eq("user_id", user.id).maybeSingle(),
  ]);

  if (!contact?.email) {
    return NextResponse.json({ error: "Ce message n'a pas de destinataire avec une adresse e-mail" }, { status: 400 });
  }

  const { count: envoyesAujourdhui } = await supabase
    .from("prospections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("date_envoi", aujourdhui)
    .in("statut", ["envoyee", "reponse_recue", "sans_suite"]);
  if ((envoyesAujourdhui ?? 0) >= MAX_ENVOIS_PAR_JOUR) {
    return NextResponse.json(
      { error: `Limite de ${MAX_ENVOIS_PAR_JOUR} envois par jour atteinte : reprends demain` },
      { status: 429 },
    );
  }

  const joindreCv: boolean = typeof body?.joindre_cv === "boolean" ? body.joindre_cv : true;
  let pieceJointe;
  if (joindreCv) {
    const cv = await lireCvReference(supabase, user.id);
    if (!cv) {
      return NextResponse.json({ error: "Aucun CV n'est enregistré : ajoute-le avant d'envoyer" }, { status: 409 });
    }
    pieceJointe = { nomFichier: nomPieceJointeCv(profil?.contact?.nom), contenu: cv.contenu };
  }

  // On « réserve » le message en le passant à envoyé AVANT l'envoi : un
  // deuxième clic, ou un deuxième onglet, ne trouve plus le statut attendu et
  // ne peut donc pas envoyer le même message deux fois.
  const maintenant = new Date().toISOString();
  const { data: reserve, error: reserveError } = await supabase
    .from("prospections")
    .update({ ...transition.message, updated_at: maintenant })
    .eq("id", prospection.id)
    .eq("user_id", user.id)
    .eq("statut", prospection.statut)
    .select()
    .maybeSingle();

  if (reserveError) return NextResponse.json({ error: reserveError.message }, { status: 500 });
  if (!reserve) {
    return NextResponse.json({ error: "Ce message est déjà en cours d'envoi ou a déjà été envoyé" }, { status: 409 });
  }

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
      .eq("user_id", user.id)
      .select()
      .single();

    if (transition.parent && parent) {
      await supabase
        .from("prospections")
        .update({ ...transition.parent, updated_at: maintenant })
        .eq("id", parent.id)
        .eq("user_id", user.id);
    }

    return NextResponse.json({ prospection: envoye ?? reserve, piece_jointe: pieceJointe?.nomFichier ?? null });
  } catch (e) {
    // L'envoi a échoué : on remet le message dans son état d'avant pour qu'il
    // reste modifiable et renvoyable.
    await supabase
      .from("prospections")
      .update({
        statut: prospection.statut,
        date_envoi: prospection.date_envoi,
        prochaine_relance: prospection.prochaine_relance,
        updated_at: new Date().toISOString(),
      })
      .eq("id", prospection.id)
      .eq("user_id", user.id);

    console.error("Erreur envoi e-mail:", e);
    const detail = e instanceof Error ? e.message : "Erreur inconnue";
    const aide = /Invalid login|Username and Password|535/i.test(detail)
      ? " — vérifie SMTP_USER et le mot de passe d'application Gmail (pas ton mot de passe habituel)"
      : "";
    return NextResponse.json({ error: `L'envoi a échoué : ${detail}${aide}` }, { status: 502 });
  }
}
