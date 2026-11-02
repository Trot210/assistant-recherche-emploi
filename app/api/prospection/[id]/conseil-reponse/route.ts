import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ouvrirUsage } from "@/lib/anthropic/usage";
import { analyserReponse } from "@/lib/prospection/analyser-reponse";
import type { ConseilReponse } from "@/lib/prospection/conseil-reponse";

// Lecture de la boîte + une analyse + un contrôle : plus long qu'une route ordinaire.
export const maxDuration = 60;

// Dernier conseil enregistré pour cette candidature, sans rien appeler d'externe.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data, error } = await supabase
    .from("conseils_reponses")
    .select("contenu, message_id, reponse_date, created_at")
    .eq("prospection_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  // Table absente (migration pas encore appliquée) : pas de conseil enregistré, sans bloquer l'écran.
  if (error) {
    console.error("Lecture du conseil enregistré impossible:", error.message);
    return NextResponse.json({ conseil: null });
  }
  if (!data) return NextResponse.json({ conseil: null });

  return NextResponse.json({
    conseil: data.contenu as unknown as ConseilReponse,
    reponse_date: data.reponse_date,
    analyse_le: data.created_at,
  });
}

// Analyse une réponse DÉJÀ enregistrée sur la candidature : ce qu'elle dit, s'il
// faut répondre, et un exemple de réponse quand c'est pertinent. Le message
// complet est relu dans la boîte mail en lecture seule (la candidature ne garde
// qu'un court extrait). Rien n'est envoyé, rien n'est modifié dans la boîte mail
// ni sur la candidature : seul le conseil est mémorisé.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data: prospection, error } = await supabase
    .from("prospections")
    .select()
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!prospection) return NextResponse.json({ error: "Message introuvable" }, { status: 404 });

  if (prospection.statut !== "reponse_recue") {
    return NextResponse.json({ error: "Cette candidature n'a pas de réponse enregistrée à analyser." }, { status: 409 });
  }
  if (prospection.reponse_type === "non_distribue") {
    return NextResponse.json(
      { error: "C'est un rapport de non-distribution, pas une réponse : il n'y a rien à répondre." },
      { status: 409 },
    );
  }

  const plafond = await ouvrirUsage(supabase, user.id, "conseil-reponse");
  if (plafond) return plafond;

  const resultat = await analyserReponse(supabase, user.id, prospection);
  if ("erreur" in resultat) return NextResponse.json({ error: resultat.erreur }, { status: resultat.statut });
  return NextResponse.json(resultat);
}
