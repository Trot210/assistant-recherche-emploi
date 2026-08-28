import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { genererMessageMotivation } from "@/lib/anthropic/documents";

// Génération + contrôle qualité (2 appels Claude séquentiels).
export const maxDuration = 60;

// Message de motivation court (≤1800 caractères) : pas de PDF, texte brut
// destiné à être copié-collé dans un formulaire de candidature en ligne.
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const offreId = body?.offre_id;

  if (typeof offreId !== "string") {
    return NextResponse.json({ error: "offre_id est requis" }, { status: 400 });
  }

  const [{ data: profil, error: profilError }, { data: offre, error: offreError }] =
    await Promise.all([
      supabase.from("profil").select().eq("user_id", user.id).maybeSingle(),
      supabase.from("offres").select().eq("id", offreId).eq("user_id", user.id).maybeSingle(),
    ]);

  if (profilError) {
    return NextResponse.json({ error: profilError.message }, { status: 500 });
  }
  if (offreError) {
    return NextResponse.json({ error: offreError.message }, { status: 500 });
  }
  if (!profil) {
    return NextResponse.json(
      {
        error:
          "Profil non renseigné — remplis-le via PUT /api/profil avant de générer un message",
      },
      { status: 400 },
    );
  }
  if (!offre) {
    return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
  }

  const { texte, avertissements } = await genererMessageMotivation(profil, offre);

  const { data: candidature, error: candidatureError } = await supabase
    .from("candidatures")
    .upsert(
      { user_id: user.id, offre_id: offre.id, message_motivation: texte },
      { onConflict: "offre_id" },
    )
    .select()
    .single();

  if (candidatureError) {
    return NextResponse.json({ error: candidatureError.message }, { status: 500 });
  }

  return NextResponse.json({ candidature, message: texte, avertissements });
}
