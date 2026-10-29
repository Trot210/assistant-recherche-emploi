import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { creerBrouillon, GmailNonConfigure } from "@/lib/gmail/client";
import { lireCvReference, nomPieceJointeCv } from "@/lib/prospection/cv";

export const maxDuration = 30;

// Crée le brouillon dans Gmail — jamais l'envoi : l'utilisateur relit et
// clique sur « Envoyer » lui-même. Refuse tout message non validé.
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

  const { data: prospection, error } = await supabase
    .from("prospections")
    .select()
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!prospection) return NextResponse.json({ error: "Message introuvable" }, { status: 404 });
  if (prospection.statut !== "valide") {
    return NextResponse.json({ error: "Valide le message avant de créer le brouillon" }, { status: 409 });
  }

  const [{ data: contact }, { data: entreprise }, { data: profil }] = await Promise.all([
    prospection.contact_id
      ? supabase.from("contacts").select().eq("id", prospection.contact_id).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("entreprises").select().eq("id", prospection.entreprise_id).eq("user_id", user.id).maybeSingle(),
    supabase.from("profil").select().eq("user_id", user.id).maybeSingle(),
  ]);

  if (!contact?.email) {
    return NextResponse.json(
      { error: "Ajoute un contact avec une adresse e-mail pour créer le brouillon" },
      { status: 400 },
    );
  }
  if (!entreprise || !profil) {
    return NextResponse.json({ error: "Profil ou entreprise introuvable" }, { status: 404 });
  }

  // Le CV accompagne le premier contact ; une relance n'en a pas besoin,
  // sauf demande explicite.
  const joindreCv: boolean = typeof body?.joindre_cv === "boolean" ? body.joindre_cv : prospection.type === "initial";

  try {
    let cvBuffer: Buffer | undefined;

    if (joindreCv) {
      const cv = await lireCvReference(supabase, user.id);
      if (!cv) {
        return NextResponse.json({ error: "Aucun CV n'est enregistré : ajoute-le avant de créer le brouillon" }, { status: 409 });
      }
      cvBuffer = cv.contenu;
    }

    const nomCandidat = profil.contact.nom;
    const brouillon = await creerBrouillon({
      a: contact.email,
      objet: prospection.objet,
      corps: prospection.corps,
      threadId: prospection.gmail_thread_id,
      pieceJointe: cvBuffer
        ? { nomFichier: nomPieceJointeCv(nomCandidat), contentType: "application/pdf", contenu: cvBuffer }
        : undefined,
    });

    const { data: misAJour, error: updateError } = await supabase
      .from("prospections")
      .update({
        statut: "brouillon_gmail",
        gmail_draft_id: brouillon.draftId,
        gmail_message_id: brouillon.messageId,
        gmail_thread_id: brouillon.threadId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", prospection.id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    return NextResponse.json({ prospection: misAJour, lien_brouillon: brouillon.lien });
  } catch (e) {
    if (e instanceof GmailNonConfigure) {
      return NextResponse.json({ error: e.message, gmail_non_configure: true }, { status: 501 });
    }
    console.error("Erreur création brouillon Gmail:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur inconnue lors de la création du brouillon" },
      { status: 500 },
    );
  }
}
