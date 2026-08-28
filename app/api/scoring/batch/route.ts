import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scoreCompatibilite } from "@/lib/anthropic/scoring";

// Un appel Claude par offre à scorer, mesuré à ~10-12s chacun en pratique
// (thinking adaptatif) : 6 offres tient large dans 120s, avec de la marge.
export const maxDuration = 120;
const TAILLE_LOT = 6;

// Résout l'appelant : session utilisateur classique, ou job planifié
// (GitHub Actions) authentifié par secret — même pattern que
// /api/offres/sync.
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

// Note un lot d'offres pas encore notées (hors stages/alternances, exclus
// du système de recommandation). À appeler plusieurs fois pour rattraper
// tout le backlog — chaque appel traite TAILLE_LOT offres et indique
// combien il en reste.
export async function POST(request: Request) {
  const appelant = await resolveAppelant(request);

  if ("error" in appelant) {
    return NextResponse.json({ error: appelant.error }, { status: 401 });
  }

  const { supabase, userId } = appelant;

  try {
    const { data: profil, error: profilError } = await supabase
      .from("profil")
      .select()
      .eq("user_id", userId)
      .maybeSingle();

    if (profilError) {
      return NextResponse.json({ error: profilError.message }, { status: 500 });
    }
    if (!profil) {
      return NextResponse.json(
        { error: "Profil non renseigné — remplis-le avant de lancer le scoring en masse" },
        { status: 400 },
      );
    }

    const [{ data: scores, error: scoresError }, { data: offres, error: offresError }] =
      await Promise.all([
        supabase.from("scores").select("offre_id").eq("user_id", userId),
        supabase
          .from("offres")
          .select()
          .eq("user_id", userId)
          .eq("stage", false)
          .eq("alternance", false)
          .order("date_publication", { ascending: false }),
      ]);

    if (scoresError) {
      return NextResponse.json({ error: scoresError.message }, { status: 500 });
    }
    if (offresError) {
      return NextResponse.json({ error: offresError.message }, { status: 500 });
    }

    const offreIdsNotees = new Set((scores ?? []).map((s) => s.offre_id));
    const offresNonNotees = (offres ?? []).filter((o) => !offreIdsNotees.has(o.id));
    const lot = offresNonNotees.slice(0, TAILLE_LOT);

    const erreurs: string[] = [];
    let scoredCount = 0;

    for (const offre of lot) {
      try {
        const resultat = await scoreCompatibilite(profil, offre);
        const { error: upsertError } = await supabase.from("scores").upsert(
          {
            user_id: userId,
            offre_id: offre.id,
            score: resultat.score,
            points_forts: resultat.points_forts,
            ecarts: resultat.ecarts,
          },
          { onConflict: "offre_id" },
        );
        if (upsertError) {
          erreurs.push(`${offre.titre}: ${upsertError.message}`);
        } else {
          scoredCount += 1;
        }
      } catch (error) {
        erreurs.push(
          `${offre.titre}: ${error instanceof Error ? error.message : "erreur inconnue"}`,
        );
      }
    }

    return NextResponse.json({
      scored: scoredCount,
      restantes: offresNonNotees.length - scoredCount,
      erreurs,
    });
  } catch (error) {
    console.error("Erreur scoring en masse:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : "Erreur inconnue lors du scoring en masse",
      },
      { status: 500 },
    );
  }
}
