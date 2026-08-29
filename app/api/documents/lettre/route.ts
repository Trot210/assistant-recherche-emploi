import { NextResponse } from "next/server";
import { resolveProfilEtOffre } from "@/lib/api/resolveProfilEtOffre";
import { genererLettreMotivation } from "@/lib/anthropic/documents";
import { buildLettrePdf } from "@/lib/documents/pdf";

// Génération + contrôle qualité (2 appels Claude séquentiels).
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
    const { texte: lettre, avertissements } = await genererLettreMotivation(profil, offre);
    const buffer = await buildLettrePdf(lettre, profil.contact);

    // Chemin seul, pas d'URL signée stockée — voir le commentaire équivalent
    // dans /api/documents/cv.
    const path = `${user.id}/${offre.id}/lettre.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(path, buffer, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: candidature, error: candidatureError } = await supabase
      .from("candidatures")
      .upsert(
        { user_id: user.id, offre_id: offre.id, lm_generee_url: path },
        { onConflict: "offre_id" },
      )
      .select()
      .single();

    if (candidatureError) {
      return NextResponse.json({ error: candidatureError.message }, { status: 500 });
    }

    return NextResponse.json({ candidature, lettre, avertissements });
  } catch (error) {
    console.error("Erreur génération lettre:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : "Erreur inconnue lors de la génération de la lettre",
      },
      { status: 500 },
    );
  }
}
