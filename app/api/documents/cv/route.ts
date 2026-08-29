import { NextResponse } from "next/server";
import { resolveProfilEtOffre } from "@/lib/api/resolveProfilEtOffre";
import { genererContenuCV } from "@/lib/anthropic/documents";
import { buildCvPdf } from "@/lib/documents/pdf";

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
    const { contenu, avertissements } = await genererContenuCV(profil, offre);
    const buffer = await buildCvPdf(contenu, profil.contact, profil.formation, profil.activites);

    // On ne stocke que le chemin du fichier, pas d'URL signée : une URL
    // signée avec une longue durée de vie, stockée en base et affichée
    // dans le dashboard, resterait valable pour quiconque l'intercepte
    // (historique navigateur, capture d'écran...). Une URL fraîche et de
    // courte durée est générée à la demande par /api/documents/[offreId]/cv.
    const path = `${user.id}/${offre.id}/cv.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(path, buffer, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: candidature, error: candidatureError } = await supabase
      .from("candidatures")
      .upsert(
        { user_id: user.id, offre_id: offre.id, cv_genere_url: path },
        { onConflict: "offre_id" },
      )
      .select()
      .single();

    if (candidatureError) {
      return NextResponse.json({ error: candidatureError.message }, { status: 500 });
    }

    return NextResponse.json({ candidature, contenu, avertissements });
  } catch (error) {
    console.error("Erreur génération CV:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : "Erreur inconnue lors de la génération du CV",
      },
      { status: 500 },
    );
  }
}
