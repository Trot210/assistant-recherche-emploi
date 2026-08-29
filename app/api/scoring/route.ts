import { NextResponse } from "next/server";
import { resolveProfilEtOffre } from "@/lib/api/resolveProfilEtOffre";
import { scoreCompatibilite } from "@/lib/anthropic/scoring";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const offreId = body?.offre_id;

  if (typeof offreId !== "string") {
    return NextResponse.json({ error: "offre_id est requis" }, { status: 400 });
  }

  const resolu = await resolveProfilEtOffre(offreId);
  if ("error" in resolu) {
    return NextResponse.json({ error: resolu.error }, { status: resolu.status });
  }
  const { supabase, user, profil, offre } = resolu;

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
