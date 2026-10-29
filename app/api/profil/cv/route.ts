import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cheminCvReference, nomFichierCv, nomPieceJointeCv, validerPdf } from "@/lib/prospection/cv";
import type { Langue } from "@/types/database.types";

const LANGUES: Langue[] = ["fr", "en"];

// État des CV de référence (un par langue) : présent ou non, nom de la pièce
// jointe, taille, et un lien de courte durée pour l'ouvrir avant d'envoyer.
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const [{ data: fichiers }, { data: profil }] = await Promise.all([
    supabase.storage.from("documents").list(user.id, { search: "cv-reference" }),
    supabase.from("profil").select("contact").eq("user_id", user.id).maybeSingle(),
  ]);

  const cv: Record<Langue, { nomFichier: string; taille: number | null; url: string | null } | null> = {
    fr: null,
    en: null,
  };
  for (const langue of LANGUES) {
    const fichier = fichiers?.find((f) => f.name === nomFichierCv(langue));
    if (!fichier) continue;
    const { data: signe } = await supabase.storage
      .from("documents")
      .createSignedUrl(cheminCvReference(user.id, langue), 300);
    cv[langue] = {
      nomFichier: nomPieceJointeCv(profil?.contact?.nom, langue),
      taille: (fichier.metadata as { size?: number } | null)?.size ?? null,
      url: signe?.signedUrl ?? null,
    };
  }

  return NextResponse.json({ cv });
}

// Remplace le CV de référence de la langue indiquée par le PDF envoyé.
export async function PUT(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const fichier = formData?.get("cv");
  const langue = formData?.get("langue") ?? "fr";
  if (!(fichier instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
  }
  if (langue !== "fr" && langue !== "en") {
    return NextResponse.json({ error: "langue doit être fr ou en" }, { status: 400 });
  }

  const octets = new Uint8Array(await fichier.arrayBuffer());
  const probleme = validerPdf(octets);
  if (probleme) return NextResponse.json({ error: probleme }, { status: 400 });

  const { error } = await supabase.storage
    .from("documents")
    .upload(cheminCvReference(user.id, langue), octets, { contentType: "application/pdf", upsert: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, taille: octets.length });
}
