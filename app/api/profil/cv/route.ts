import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cheminCvReference, nomPieceJointeCv, validerPdf } from "@/lib/prospection/cv";

// État du CV de référence : présent ou non, nom de la pièce jointe, taille, et
// un lien de courte durée pour l'ouvrir avant d'envoyer.
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const chemin = cheminCvReference(user.id);
  const { data: fichiers } = await supabase.storage.from("documents").list(user.id, { search: "cv-reference.pdf" });
  const fichier = fichiers?.find((f) => f.name === "cv-reference.pdf");
  if (!fichier) return NextResponse.json({ cv: null });

  const [{ data: signe }, { data: profil }] = await Promise.all([
    supabase.storage.from("documents").createSignedUrl(chemin, 300),
    supabase.from("profil").select("contact").eq("user_id", user.id).maybeSingle(),
  ]);

  return NextResponse.json({
    cv: {
      nomFichier: nomPieceJointeCv(profil?.contact?.nom),
      taille: (fichier.metadata as { size?: number } | null)?.size ?? null,
      url: signe?.signedUrl ?? null,
    },
  });
}

// Remplace le CV de référence par le PDF envoyé.
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
  if (!(fichier instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
  }

  const octets = new Uint8Array(await fichier.arrayBuffer());
  const probleme = validerPdf(octets);
  if (probleme) return NextResponse.json({ error: probleme }, { status: 400 });

  const { error } = await supabase.storage
    .from("documents")
    .upload(cheminCvReference(user.id), octets, { contentType: "application/pdf", upsert: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, taille: octets.length });
}
