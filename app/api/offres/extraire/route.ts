import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extraireOffreDepuisTexte } from "@/lib/anthropic/extraction";

export const maxDuration = 60;

// Auto-remplissage du formulaire d'ajout manuel : l'utilisateur colle le
// texte brut d'une offre (LinkedIn, WTTJ, Indeed, Glassdoor...) et Claude en
// extrait les champs structurés, plutôt que de scraper ces sites (pas d'API
// publique, et le scraping violerait leurs conditions d'utilisation).
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body.texte !== "string" || body.texte.trim() === "") {
    return NextResponse.json({ error: "Le texte de l'offre est requis" }, { status: 400 });
  }

  try {
    const offre = await extraireOffreDepuisTexte(body.texte.trim());
    return NextResponse.json({ offre });
  } catch (error) {
    console.error("Erreur extraction offre:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : "Erreur inconnue lors de l'extraction",
      },
      { status: 500 },
    );
  }
}
