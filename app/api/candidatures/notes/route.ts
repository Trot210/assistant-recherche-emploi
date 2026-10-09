import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const LONGUEUR_MAX = 2000;

// Enregistre les notes d'une candidature DÉJÀ suivie (les notes n'ont de sens
// que sur une candidature existante — elles se saisissent depuis le suivi).
export async function PUT(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const offreId = body?.offre_id;
  const notes = body?.notes;

  if (typeof offreId !== "string") {
    return NextResponse.json({ error: "offre_id est requis" }, { status: 400 });
  }
  if (typeof notes !== "string") {
    return NextResponse.json({ error: "notes doit être une chaîne" }, { status: 400 });
  }
  if (notes.length > LONGUEUR_MAX) {
    return NextResponse.json(
      { error: `Notes trop longues (${LONGUEUR_MAX} caractères maximum)` },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("candidatures")
    .update({ notes: notes.trim() === "" ? null : notes })
    .eq("offre_id", offreId)
    .eq("user_id", user.id)
    .select("offre_id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Candidature introuvable" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
