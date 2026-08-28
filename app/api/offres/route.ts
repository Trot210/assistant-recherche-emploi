import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { detecterStage } from "@/lib/dashboard-utils";

// Ajout manuel d'une offre trouvée sur une source sans API de lecture
// (APEC, LinkedIn, Indeed, JobTeaser, Welcome to the Jungle...) — voir
// lib/france-travail pour la source automatisée.
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

  const source = typeof body.source === "string" && body.source.trim() !== ""
    ? body.source.trim()
    : "Autre";

  const titre = body.titre.trim();
  const typeContrat =
    typeof body.type_contrat === "string" && body.type_contrat.trim() !== ""
      ? body.type_contrat.trim()
      : null;

  // Pas de champ dédié pour un ajout manuel : on déduit alternance/stage du
  // titre et du type de contrat renseignés, comme pour la sync automatique.
  const texteADetecter = `${titre} ${typeContrat ?? ""}`;
  const alternance = /\balternance\b|\bapprentissage\b|\bprofessionnalisation\b/i.test(
    texteADetecter,
  );
  const stage = detecterStage(texteADetecter);

  const { data, error } = await supabase
    .from("offres")
    .insert({
      user_id: user.id,
      titre,
      entreprise: body.entreprise ?? null,
      description: body.description ?? null,
      source,
      // Pas d'identifiant officiel pour un ajout manuel : on en génère un
      // propre à cette offre pour respecter la contrainte d'unicité.
      source_id: crypto.randomUUID(),
      lien_original: body.lien_original.trim(),
      localisation: body.localisation ?? null,
      date_publication: body.date_publication ?? null,
      type_contrat: typeContrat,
      type_contrat_libelle: typeContrat,
      alternance,
      stage,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ offre: data }, { status: 201 });
}
