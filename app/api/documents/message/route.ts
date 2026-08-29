import { NextResponse } from "next/server";
import { resolveProfilEtOffre } from "@/lib/api/resolveProfilEtOffre";
import { genererMessageMotivation } from "@/lib/anthropic/documents";

// Génération + contrôle qualité (2 appels Claude séquentiels).
export const maxDuration = 60;

// Message de motivation court (≤1800 caractères) : pas de PDF, texte brut
// destiné à être copié-collé dans un formulaire de candidature en ligne.
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
  } catch (error) {
    console.error("Erreur génération message:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : "Erreur inconnue lors de la génération du message",
      },
      { status: 500 },
    );
  }
}
