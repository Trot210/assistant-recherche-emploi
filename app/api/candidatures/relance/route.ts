import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ouvrirUsage } from "@/lib/anthropic/usage";
import { genererRelanceCandidature } from "@/lib/anthropic/relance-candidature";

export const maxDuration = 60;

// Rédige le brouillon de relance d'une candidature sur offre restée sans nouvelles. Un appel à Claude, environ
// un demi-centime. Rien n'est envoyé : le texte s'affiche pour que tu le relises et l'envoies toi-même (la
// candidature a été déposée sur un site, sans adresse de contact connue).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const corps = await request.json().catch(() => null);
  const id = corps?.candidature_id;
  if (typeof id !== "string") return NextResponse.json({ error: "candidature_id est requis" }, { status: 400 });

  const { data: candidature, error } = await supabase
    .from("candidatures")
    .select("id, date_envoi, offres(titre, entreprise)")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!candidature?.offres || !candidature.date_envoi) return NextResponse.json({ error: "Candidature introuvable" }, { status: 404 });

  const { data: profil } = await supabase.from("profil").select().eq("user_id", user.id).maybeSingle();
  if (!profil) return NextResponse.json({ error: "Profil non renseigné" }, { status: 409 });

  const bloque = await ouvrirUsage(supabase, user.id, "relance-candidature");
  if (bloque) return bloque;

  try {
    const relance = await genererRelanceCandidature({
      profil,
      titre: candidature.offres.titre,
      entreprise: candidature.offres.entreprise ?? "l'entreprise",
      envoyeLe: candidature.date_envoi,
    });
    return NextResponse.json({ relance });
  } catch (e) {
    console.error("Erreur de rédaction de la relance:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Rédaction impossible" }, { status: 502 });
  }
}
