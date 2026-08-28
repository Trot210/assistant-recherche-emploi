import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scoreCompatibilite } from "@/lib/anthropic/scoring";

export const maxDuration = 60;

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
      { error: "Profil non renseigné — remplis-le via PUT /api/profil avant de scorer une offre" },
      { status: 400 },
    );
  }
  if (!offre) {
    return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
  }

  try {
    const resultat = await scoreCompatibilite(profil, offre);

    const { data: score, error: scoreError } = await supabase
      .from("scores")
      .upsert(
        {
          user_id: user.id,
          offre_id: offre.id,
          score: resultat.score,
          points_forts: resultat.points_forts,
          ecarts: resultat.ecarts,
        },
        { onConflict: "offre_id" },
      )
      .select()
      .single();

    if (scoreError) {
      return NextResponse.json({ error: scoreError.message }, { status: 500 });
    }

    return NextResponse.json({ score });
  } catch (error) {
    console.error("Erreur scoring:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : "Erreur inconnue lors du scoring",
      },
      { status: 500 },
    );
  }
}
