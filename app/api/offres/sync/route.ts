import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchOffres } from "@/lib/france-travail/client";
import type { OffreInsert } from "@/types/offre";

// Départements Île-de-France : Paris intra-muros + petite/grande couronne.
const DEPARTEMENTS_IDF = ["75", "77", "78", "91", "92", "93", "94", "95"];

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const motsCles: string | undefined = body.motsCles;
  const departements: string[] = body.departements ?? DEPARTEMENTS_IDF;

  const offres: OffreInsert[] = [];
  const erreurs: string[] = [];

  for (const departement of departements) {
    try {
      const { resultats } = await searchOffres({
        motsCles,
        departement,
        range: "0-149",
        // Les plus récentes en premier, pour repérer vite les offres qui
        // viennent d'être publiées.
        sort: 1,
      });

      for (const offre of resultats) {
        offres.push({
          user_id: user.id,
          titre: offre.intitule,
          entreprise: offre.entreprise?.nom ?? null,
          description: offre.description ?? null,
          source: "france_travail",
          source_id: offre.id,
          lien_original: offre.origineOffre?.urlOrigine ?? "",
          localisation: offre.lieuTravail?.libelle ?? null,
          date_publication: offre.dateCreation
            ? offre.dateCreation.slice(0, 10)
            : null,
        });
      }
    } catch (error) {
      erreurs.push(
        `Département ${departement}: ${
          error instanceof Error ? error.message : "erreur inconnue"
        }`,
      );
    }
  }

  if (offres.length === 0) {
    return NextResponse.json(
      { inserted: 0, erreurs },
      { status: erreurs.length > 0 ? 502 : 200 },
    );
  }

  const { error, count } = await supabase
    .from("offres")
    .upsert(offres, { onConflict: "user_id,source,source_id", count: "exact" });

  if (error) {
    return NextResponse.json({ error: error.message, erreurs }, { status: 500 });
  }

  return NextResponse.json({ synced: count ?? offres.length, erreurs });
}
