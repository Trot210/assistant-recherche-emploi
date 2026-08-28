import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchOffres } from "@/lib/france-travail/client";
import { detecterStage, detecterAlternanceParTitre } from "@/lib/dashboard-utils";
import type { OffreInsert } from "@/types/offre";

// 8 départements × 6 mots-clés = 48 requêtes séquentielles vers l'API
// France Travail (limitée à ~3 req/s) : largement au-delà des 10s par
// défaut sur Vercel.
export const maxDuration = 60;

// Départements Île-de-France : Paris intra-muros + petite/grande couronne.
const DEPARTEMENTS_IDF = ["75", "77", "78", "91", "92", "93", "94", "95"];

// L'API France Travail ne supporte qu'un seul mot-clé/phrase par requête
// (les virgules ne fonctionnent pas comme un "OU") : on boucle sur chaque
// mot-clé pour chaque département. Utilisés par défaut par le job planifié
// (GitHub Actions) et le bouton "Synchroniser" du dashboard, sauf si un
// motsCles explicite est fourni dans le corps de la requête.
const MOTS_CLES_DEFAUT = [
  "category manager",
  "acheteur",
  "chef de produit",
  "marketing",
  "trade marketing",
  "commercial",
];

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
  const motsClesListe: string[] = body.motsCles ? [body.motsCles] : MOTS_CLES_DEFAUT;
  const departements: string[] = body.departements ?? DEPARTEMENTS_IDF;

  const offresParId = new Map<string, OffreInsert>();
  const erreurs: string[] = [];

  for (const departement of departements) {
    for (const motsCles of motsClesListe) {
      try {
        const { resultats } = await searchOffres({
          motsCles,
          departement,
          range: "0-49",
          // Les plus récentes en premier, pour repérer vite les offres qui
          // viennent d'être publiées.
          sort: 1,
        });

        for (const offre of resultats) {
          offresParId.set(offre.id, {
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
            type_contrat: offre.typeContrat ?? null,
            type_contrat_libelle: offre.typeContratLibelle ?? null,
            alternance: (offre.alternance ?? false) || detecterAlternanceParTitre(offre.intitule),
            stage: detecterStage(offre.intitule),
          });
        }
      } catch (error) {
        erreurs.push(
          `Département ${departement} / "${motsCles}": ${
            error instanceof Error ? error.message : "erreur inconnue"
          }`,
        );
      }
    }
  }

  const offres = Array.from(offresParId.values());

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
