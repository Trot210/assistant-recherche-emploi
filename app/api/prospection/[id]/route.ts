import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  appliquerAction,
  aujourdhuiParis,
  estEnCours,
  type ActionProspection,
} from "@/lib/prospection/workflow";

const ACTIONS: ActionProspection[] = ["valider", "marquer_envoyee", "reponse_recue", "sans_suite"];

// Deux usages : modifier le texte (objet/corps) ou faire avancer le message
// (action). Les règles de passage d'un statut à l'autre vivent dans
// lib/prospection/workflow.ts ; cette route ne fait que les appliquer.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const maintenant = new Date().toISOString();

  if (typeof body?.action === "string") {
    const action = body.action as ActionProspection;
    if (!ACTIONS.includes(action)) {
      return NextResponse.json({ error: `action doit être l'une de: ${ACTIONS.join(", ")}` }, { status: 400 });
    }

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

    const transition = appliquerAction(prospection, parent, action, aujourdhuiParis());
    if ("erreur" in transition) {
      return NextResponse.json({ error: transition.erreur }, { status: 409 });
    }

    const { data: misAJour, error: updateError } = await supabase
      .from("prospections")
      .update({ ...transition.message, updated_at: maintenant })
      .eq("id", prospection.id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    const idInitial = prospection.parent_id ?? prospection.id;
    if (transition.parent && parent) {
      await supabase
        .from("prospections")
        .update({ ...transition.parent, updated_at: maintenant })
        .eq("id", parent.id)
        .eq("user_id", user.id);
    }
    if (transition.abandonnerRelancesEnCours) {
      await supabase
        .from("prospections")
        .update({ statut: "sans_suite", updated_at: maintenant })
        .eq("parent_id", idInitial)
        .eq("user_id", user.id)
        .in("statut", ["a_valider", "valide", "brouillon_gmail"]);
    }

    return NextResponse.json({ prospection: misAJour });
  }

  const objet: unknown = body?.objet;
  const corps: unknown = body?.corps;
  if (typeof objet !== "string" && typeof corps !== "string") {
    return NextResponse.json({ error: "action, objet ou corps est requis" }, { status: 400 });
  }
  if (!estEnCours(prospection.statut)) {
    return NextResponse.json({ error: "Un message déjà envoyé ne peut plus être modifié" }, { status: 409 });
  }

  const nouvelObjet = typeof objet === "string" ? objet.trim() : prospection.objet;
  const nouveauCorps = typeof corps === "string" ? corps.trim() : prospection.corps;
  if (!nouvelObjet || !nouveauCorps) {
    return NextResponse.json({ error: "L'objet et le message ne peuvent pas être vides" }, { status: 400 });
  }

  const modifie = nouvelObjet !== prospection.objet || nouveauCorps !== prospection.corps;

  const { data: misAJour, error: updateError } = await supabase
    .from("prospections")
    .update({
      objet: nouvelObjet,
      corps: nouveauCorps,
      // Un texte modifié doit être revalidé, et un brouillon Gmail déjà créé
      // ne correspond plus au texte : on repart de l'étape de validation.
      ...(modifie ? { statut: "a_valider", gmail_draft_id: null, gmail_message_id: null } : {}),
      updated_at: maintenant,
    })
    .eq("id", prospection.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ prospection: misAJour });
}
