import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { OffreSource } from "@/types/database.types";

const SOURCES_VALIDES: OffreSource[] = ["france_travail", "apec"];

// Ajout manuel d'une offre (ex: offre APEC trouvée à la main, faute d'API
// publique de lecture chez l'APEC — voir lib/france-travail pour la source
// automatisée).
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body.titre !== "string" || body.titre.trim() === "") {
    return NextResponse.json({ error: "Le titre est requis" }, { status: 400 });
  }

  if (typeof body.lien_original !== "string" || body.lien_original.trim() === "") {
    return NextResponse.json(
      { error: "Le lien original est requis" },
      { status: 400 },
    );
  }

  const source: OffreSource = body.source ?? "apec";
  if (!SOURCES_VALIDES.includes(source)) {
    return NextResponse.json(
      { error: `source doit être l'une de: ${SOURCES_VALIDES.join(", ")}` },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("offres")
    .insert({
      user_id: user.id,
      titre: body.titre.trim(),
      entreprise: body.entreprise ?? null,
      description: body.description ?? null,
      source,
      // Pas d'identifiant officiel pour un ajout manuel : on en génère un
      // propre à cette offre pour respecter la contrainte d'unicité.
      source_id: crypto.randomUUID(),
      lien_original: body.lien_original.trim(),
      localisation: body.localisation ?? null,
      date_publication: body.date_publication ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ offre: data }, { status: 201 });
}
