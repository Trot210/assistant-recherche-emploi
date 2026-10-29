import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appliquerSuivi, estIdSuivi, validerChampsSuivi } from "@/lib/prospection/suivi";
import { aujourdhuiParis } from "@/lib/prospection/workflow";

// Suivi d'une candidature envoyée : statut précis (réponse reçue, entretien,
// offre indiquée, refus...), commentaire, prochaine action. Le changement de
// statut passe par appliquerSuivi, qui réutilise les règles existantes : un
// premier retour annule les relances prévues, comme « J'ai reçu une réponse ».
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const corps = await request.json().catch(() => null);
  const validation = validerChampsSuivi(corps);
  if ("erreur" in validation) return NextResponse.json({ error: validation.erreur }, { status: 400 });

  const demandeStatut = (corps as Record<string, unknown>).statut_suivi;
  if (demandeStatut !== undefined && !estIdSuivi(demandeStatut)) {
    return NextResponse.json({ error: "statut_suivi inconnu" }, { status: 400 });
  }

  const { data: prospection, error } = await supabase
    .from("prospections")
    .select()
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!prospection) return NextResponse.json({ error: "Message introuvable" }, { status: 404 });

  let modifications: Record<string, unknown> = {};
  let abandonnerRelances = false;

  if (demandeStatut !== undefined) {
    const resultat = appliquerSuivi(prospection, demandeStatut, aujourdhuiParis(), validation.champs.reponse_date);
    if ("erreur" in resultat) return NextResponse.json({ error: resultat.erreur }, { status: 409 });
    modifications = { ...resultat.patch };
    abandonnerRelances = resultat.abandonnerRelancesEnCours;
  }

  // Ce que l'utilisateur a saisi l'emporte sur ce que le changement de statut a calculé.
  Object.assign(modifications, validation.champs);
  if (Object.keys(modifications).length === 0) {
    return NextResponse.json({ error: "Rien à modifier" }, { status: 400 });
  }

  const maintenant = new Date().toISOString();
  const { data: misAJour, error: updateError } = await supabase
    .from("prospections")
    .update({ ...modifications, updated_at: maintenant })
    .eq("id", prospection.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  if (abandonnerRelances) {
    await supabase
      .from("prospections")
      .update({ statut: "sans_suite", updated_at: maintenant })
      .eq("parent_id", prospection.id)
      .eq("user_id", user.id)
      .in("statut", ["a_valider", "valide", "brouillon_gmail"]);
  }

  return NextResponse.json({ prospection: misAJour });
}
