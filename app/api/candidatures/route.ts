import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CandidatureStatut } from "@/types/database.types";

const STATUTS_VALIDES: CandidatureStatut[] = [
  "a_traiter",
  "envoyee",
  "reponse_recue",
  "entretien",
  "refusee",
  "offre",
];

// Met à jour le statut d'une candidature (ex: "marquer comme envoyée" /
// "retirer du suivi" depuis le dashboard). Crée la ligne si elle n'existe
// pas encore (une offre peut ne pas avoir de CV/LM générés mais être
// marquée envoyée quand même).
export async function PATCH(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const offreId = body?.offre_id;
  const statut: CandidatureStatut = body?.statut;

  if (typeof offreId !== "string") {
    return NextResponse.json({ error: "offre_id est requis" }, { status: 400 });
  }
  if (!STATUTS_VALIDES.includes(statut)) {
    return NextResponse.json(
      { error: `statut doit être l'un de: ${STATUTS_VALIDES.join(", ")}` },
      { status: 400 },
    );
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

  // date_envoi doit survivre aux étapes suivantes (entretien, refus, offre)
  // — seul un retour à "à traiter" doit l'effacer. On préserve donc la
  // valeur existante plutôt que de la recalculer à chaque changement de
  // statut (l'upsert précédent l'écrasait à null dès que statut !== "envoyee").
  const { data: existante } = await supabase
    .from("candidatures")
    .select("date_envoi")
    .eq("offre_id", offreId)
    .eq("user_id", user.id)
    .maybeSingle();

  let dateEnvoi: string | null;
  if (statut === "a_traiter") {
    dateEnvoi = null;
  } else if (existante?.date_envoi) {
    dateEnvoi = existante.date_envoi;
  } else {
    dateEnvoi = new Date().toISOString().slice(0, 10);
  }

  const { data: candidature, error } = await supabase
    .from("candidatures")
    .upsert(
      { user_id: user.id, offre_id: offreId, statut, date_envoi: dateEnvoi },
      { onConflict: "offre_id" },
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ candidature });
}
