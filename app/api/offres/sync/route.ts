import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchOffres } from "@/lib/france-travail/client";
import type { OffreInsert } from "@/types/offre";

// Départements Île-de-France : Paris intra-muros + petite/grande couronne.
const DEPARTEMENTS_IDF = ["75", "77", "78", "91", "92", "93", "94", "95"];

// Résout l'appelant : soit une session utilisateur classique (navigateur),
// soit un job planifié externe (GitHub Actions) authentifié par secret —
// ce dernier écrit via le client service_role pour l'utilisateur désigné
// par SYNC_USER_ID, faute de session interactive.
async function resolveAppelant(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization")?.trim();

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    const syncUserId = process.env.SYNC_USER_ID?.trim();
    if (!syncUserId) {
      return { error: "SYNC_USER_ID non configuré côté serveur" } as const;
    }
    return { supabase: createAdminClient(), userId: syncUserId } as const;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Non authentifié" } as const;
  }

  return { supabase, userId: user.id } as const;
}

export async function POST(request: Request) {
  const appelant = await resolveAppelant(request);

  if ("error" in appelant) {
    return NextResponse.json({ error: appelant.error }, { status: 401 });
  }

  const { supabase, userId } = appelant;

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
          user_id: userId,
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
