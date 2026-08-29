import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const CINQ_MINUTES_EN_SECONDES = 5 * 60;
const TYPES_VALIDES = ["cv", "lettre"] as const;

// Génère une URL signée fraîche et de courte durée à la demande, plutôt que
// d'en stocker une valable un an en base (voir /api/documents/cv et
// /api/documents/lettre) — évite qu'un lien intercepté (historique
// navigateur, capture d'écran) donne un accès prolongé à des documents
// contenant des données personnelles.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ offreId: string; type: string }> },
) {
  const { offreId, type } = await params;

  if (!TYPES_VALIDES.includes(type as (typeof TYPES_VALIDES)[number])) {
    return NextResponse.json({ error: "Type de document invalide" }, { status: 400 });
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { data: offre, error: offreError } = await supabase
    .from("offres")
    .select("id")
    .eq("id", offreId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (offreError) {
    return NextResponse.json({ error: offreError.message }, { status: 500 });
  }
  if (!offre) {
    return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
  }

  const path = `${user.id}/${offreId}/${type}.pdf`;
  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from("documents")
    .createSignedUrl(path, CINQ_MINUTES_EN_SECONDES);

  if (signedUrlError || !signedUrlData) {
    return NextResponse.json(
      { error: signedUrlError?.message ?? "Document introuvable" },
      { status: 404 },
    );
  }

  return NextResponse.redirect(signedUrlData.signedUrl);
}
