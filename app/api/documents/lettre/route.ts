import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { genererLettreMotivation } from "@/lib/anthropic/documents";
import { buildLettreDocx } from "@/lib/documents/docx";

const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const UN_AN_EN_SECONDES = 60 * 60 * 24 * 365;

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
          "Profil non renseigné — remplis-le via PUT /api/profil avant de générer une lettre",
      },
      { status: 400 },
    );
  }
  if (!offre) {
    return NextResponse.json({ error: "Offre introuvable" }, { status: 404 });
  }

  const lettre = await genererLettreMotivation(profil, offre);
  const buffer = await buildLettreDocx(lettre);

  const path = `${user.id}/${offre.id}/lettre.docx`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, buffer, { contentType: DOCX_CONTENT_TYPE, upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from("documents")
    .createSignedUrl(path, UN_AN_EN_SECONDES);

  if (signedUrlError || !signedUrlData) {
    return NextResponse.json(
      { error: signedUrlError?.message ?? "Erreur de génération de l'URL signée" },
      { status: 500 },
    );
  }

  const { data: candidature, error: candidatureError } = await supabase
    .from("candidatures")
    .upsert(
      { user_id: user.id, offre_id: offre.id, lm_generee_url: signedUrlData.signedUrl },
      { onConflict: "offre_id" },
    )
    .select()
    .single();

  if (candidatureError) {
    return NextResponse.json({ error: candidatureError.message }, { status: 500 });
  }

  return NextResponse.json({ candidature, lettre });
}
