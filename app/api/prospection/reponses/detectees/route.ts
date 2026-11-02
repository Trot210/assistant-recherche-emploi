import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reponsesEnAttente } from "@/lib/prospection/detecter-reponses";

// Réponses déjà détectées (par le traitement du matin ou une recherche précédente) et
// classées, que l'utilisateur n'a pas encore associées ni écartées. Lit seulement la
// mémoire : pas de boîte mail, pas de Claude, donc instantané et gratuit.
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  return NextResponse.json({ propositions: await reponsesEnAttente(supabase, user.id) });
}
