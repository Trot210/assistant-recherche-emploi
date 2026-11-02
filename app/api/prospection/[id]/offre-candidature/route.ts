import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validerOffre } from "@/lib/prospection/offre-depuis-reponse";

// À la suite d'une réponse « postule sur notre site » : ajoute l'offre visée dans
// « Offres », où l'on prépare le CV et la lettre adaptés. N'envoie rien, ne
// modifie ni la candidature spontanée ni la boîte mail, et ne coûte aucun appel
// à Claude. Une offre déjà ajoutée avec le même lien est reprise, pas dupliquée.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const corps = await request.json().catch(() => null);
  const validation = validerOffre({
    titre: corps?.titre,
    lien: corps?.lien,
    description: corps?.description,
    localisation: corps?.localisation,
  });
  if ("erreur" in validation) return NextResponse.json({ error: validation.erreur }, { status: 400 });
  const { offre } = validation;

  const { data: prospection, error } = await supabase
    .from("prospections")
    .select("id, entreprise_id, statut")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!prospection) return NextResponse.json({ error: "Message introuvable" }, { status: 404 });

  const { data: entreprise } = await supabase
    .from("entreprises")
    .select("nom")
    .eq("id", prospection.entreprise_id)
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: existante } = await supabase
    .from("offres")
    .select("id")
    .eq("user_id", user.id)
    .eq("lien_original", offre.lien)
    .limit(1)
    .maybeSingle();
  if (existante) return NextResponse.json({ offre_id: existante.id, deja_ajoutee: true });

  const { data: creee, error: insertError } = await supabase
    .from("offres")
    .insert({
      user_id: user.id,
      titre: offre.titre,
      entreprise: entreprise?.nom ?? null,
      description: offre.description,
      source: "Réponse d'entreprise",
      // Pas d'identifiant officiel : on en génère un propre à cette offre (contrainte d'unicité).
      source_id: crypto.randomUUID(),
      lien_original: offre.lien,
      localisation: offre.localisation,
    })
    .select("id")
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ offre_id: creee.id, deja_ajoutee: false }, { status: 201 });
}
