import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ouvrirUsage } from "@/lib/anthropic/usage";
import { preparerFicheEntretien } from "@/lib/prospection/service-fiche-entretien";

export const maxDuration = 60;

// Prépare la fiche d'un entretien (questions probables, points forts, questions à poser). Un appel à Claude,
// quelques centimes ; la fiche est gardée, un second clic la renvoie sans réécrire. Rien n'est envoyé à personne.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const corps = await request.json().catch(() => null);
  const id = corps?.id;
  if (typeof id !== "string") return NextResponse.json({ error: "id est requis" }, { status: 400 });

  const bloque = await ouvrirUsage(supabase, user.id, "fiche-entretien");
  if (bloque) return bloque;

  try {
    const resultat = await preparerFicheEntretien(supabase, user.id, id);
    if ("erreur" in resultat) return NextResponse.json({ error: resultat.erreur }, { status: resultat.statut });
    return NextResponse.json({ fiche: resultat.fiche });
  } catch (e) {
    console.error("Erreur de préparation d'entretien:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Préparation impossible" }, { status: 502 });
  }
}
