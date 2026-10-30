import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { formaterProgrammation, validerProgrammation } from "@/lib/prospection/planification";

// Modifier (date, objet, message) ou annuler un envoi programmé qui n'est pas encore
// parti. Modifier le texte ici, depuis la rubrique « Envois programmés », garde la
// programmation : tu relis le message complet avant d'enregistrer.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  const { data: programmation, error } = await supabase
    .from("envois_programmes")
    .select()
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!programmation) return NextResponse.json({ error: "Envoi programmé introuvable" }, { status: 404 });
  if (programmation.statut !== "programme") {
    return NextResponse.json({ error: "Cet envoi n'est plus modifiable (déjà parti, en cours, annulé ou échoué)" }, { status: 409 });
  }

  let avertissements: string[] = [];
  let prevuAt = programmation.prevu_at;
  if (body?.prevu_at !== undefined) {
    if (typeof body.prevu_at !== "string") return NextResponse.json({ error: "prevu_at invalide" }, { status: 400 });
    const instant = new Date(body.prevu_at);
    const validation = validerProgrammation(instant, new Date());
    if (validation.erreur) return NextResponse.json({ error: validation.erreur }, { status: 400 });
    prevuAt = instant.toISOString();
    avertissements = validation.avertissements;
  }

  if (typeof body?.objet === "string" || typeof body?.corps === "string") {
    const { data: prospection } = await supabase
      .from("prospections")
      .select("objet, corps, statut")
      .eq("id", programmation.prospection_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!prospection || prospection.statut !== "valide") {
      return NextResponse.json({ error: "Le message n'est plus modifiable : il n'est plus validé" }, { status: 409 });
    }
    const objet = typeof body.objet === "string" ? body.objet.trim() : prospection.objet;
    const corps = typeof body.corps === "string" ? body.corps.trim() : prospection.corps;
    if (!objet || !corps) return NextResponse.json({ error: "L'objet et le message ne peuvent pas être vides" }, { status: 400 });

    const { error: texteError } = await supabase
      .from("prospections")
      .update({ objet, corps, updated_at: new Date().toISOString() })
      .eq("id", programmation.prospection_id)
      .eq("user_id", user.id)
      .eq("statut", "valide");
    if (texteError) return NextResponse.json({ error: texteError.message }, { status: 500 });
  }

  // Le changement n'a lieu que si l'envoi est toujours « programmé » : un passage du
  // planificateur entre-temps l'aurait déjà réservé.
  const { data: misAJour, error: updateError } = await supabase
    .from("envois_programmes")
    .update({ prevu_at: prevuAt, erreur: null })
    .eq("id", programmation.id)
    .eq("user_id", user.id)
    .eq("statut", "programme")
    .select()
    .maybeSingle();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  if (!misAJour) return NextResponse.json({ error: "Cet envoi vient de partir ou d'être pris en charge" }, { status: 409 });

  return NextResponse.json({ programmation: misAJour, quand: formaterProgrammation(new Date(misAJour.prevu_at)), avertissements });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Conditionnel : on n'annule que ce qui n'est pas déjà parti ou pris en charge.
  const { data, error } = await supabase
    .from("envois_programmes")
    .update({ statut: "annule", erreur: "Annulé par toi", termine_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("statut", "programme")
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Cet envoi n'est plus annulable (déjà parti, en cours ou annulé)" }, { status: 409 });
  return NextResponse.json({ programmation: data });
}
