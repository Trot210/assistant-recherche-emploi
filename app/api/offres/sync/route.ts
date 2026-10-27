import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchOffres, getStatutOffre } from "@/lib/france-travail/client";
import { fenetreVerification } from "@/lib/france-travail/verification";
import { TOUS_MOTS_CLES, TAILLE_LOT_MOTS_CLES, selectionnerLotMotsCles } from "@/lib/france-travail/motsCles";
import { detecterStage, detecterAlternanceParTitre } from "@/lib/dashboard-utils";
import { estOffreHorsCible } from "@/lib/france-travail/prefiltre";
import type { OffreInsert } from "@/types/offre";

// Chaque appel reste dans un budget de requêtes proche de l'historique
// (8 départements × ~8 mots-clés ≈ 64 requêtes séquentielles vers l'API
// France Travail, limitée à ~3 req/s) : largement au-delà des 10s par
// défaut sur Vercel, d'où ce maxDuration. Voir lib/france-travail/motsCles.ts.
export const maxDuration = 60;

// Départements Île-de-France : Paris intra-muros + petite/grande couronne.
const DEPARTEMENTS_IDF = ["75", "77", "78", "91", "92", "93", "94", "95"];

// La synchro n'a jamais supprimé les offres expirées/pourvues, seulement
// ajouté — le catalogue grossissait indéfiniment (près de 5000 offres après
// quelques semaines), ce qui alourdit chaque chargement du dashboard.
// Purge les offres auto-synchronisées de plus de 1,5 mois, sauf celles
// liées à une candidature (jamais celles où tu as généré des documents ou
// que tu as marquées) : elles restent, quel que soit leur âge.
const RETENTION_JOURS = 45;

const VINGT_MINUTES_MS = 20 * 60 * 1000;

// Lot d'offres vérifiées à chaque synchro (voir lib/france-travail/
// verification.ts) : ~40 appels × ~0,35 s, en plus des ~64 requêtes de
// recherche, restent dans les 60 s de maxDuration grâce au budget ci-dessous.
const TAILLE_LOT_VERIFICATION = 40;
const BUDGET_TOTAL_MS = 50_000;
const PAUSE_ENTRE_VERIFICATIONS_MS = 350;

interface BilanVerification {
  verifiees: number;
  cloturees: number;
  inconnues: number;
}

// Retire de la base les offres que France Travail a clôturées : leur lien
// n'ouvre plus qu'une page "offre clôturée". Les offres liées à une
// candidature sont conservées (c'est ta trace de ce que tu as envoyé), et une
// réponse ambiguë de l'API (limite de débit, erreur serveur) n'est jamais
// traitée comme une clôture.
async function retirerOffresCloturees(
  supabase: Awaited<ReturnType<typeof createAdminClient>> | Awaited<ReturnType<typeof createClient>>,
  userId: string,
  demarrage: number,
): Promise<BilanVerification> {
  const bilan: BilanVerification = { verifiees: 0, cloturees: 0, inconnues: 0 };

  const { count } = await supabase
    .from("offres")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("source", "france_travail");

  const fenetre = fenetreVerification(count ?? 0, TAILLE_LOT_VERIFICATION, Date.now(), VINGT_MINUTES_MS);
  if (fenetre.fin < fenetre.debut) return bilan;

  const { data: lot } = await supabase
    .from("offres")
    .select("id, source_id")
    .eq("user_id", userId)
    .eq("source", "france_travail")
    .order("id")
    .range(fenetre.debut, fenetre.fin);

  const idsCloturees: string[] = [];
  for (const offre of lot ?? []) {
    if (Date.now() - demarrage > BUDGET_TOTAL_MS) break;
    const statut = await getStatutOffre(offre.source_id);
    bilan.verifiees += 1;
    if (statut === "cloturee") idsCloturees.push(offre.id);
    else if (statut === "inconnue") bilan.inconnues += 1;
    await new Promise((resolve) => setTimeout(resolve, PAUSE_ENTRE_VERIFICATIONS_MS));
  }

  if (idsCloturees.length === 0) return bilan;

  const { data: candidatures } = await supabase
    .from("candidatures")
    .select("offre_id")
    .eq("user_id", userId)
    .in("offre_id", idsCloturees);
  const protegees = new Set((candidatures ?? []).map((c) => c.offre_id));
  const aSupprimer = idsCloturees.filter((id) => !protegees.has(id));

  if (aSupprimer.length > 0) {
    const { count: supprimees } = await supabase
      .from("offres")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .in("id", aSupprimer);
    bilan.cloturees = supprimees ?? 0;
  }
  return bilan;
}

async function purgerOffresPerimees(
  supabase: Awaited<ReturnType<typeof createAdminClient>> | Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<number> {
  const seuil = new Date();
  seuil.setDate(seuil.getDate() - RETENTION_JOURS);
  const seuilStr = seuil.toISOString().slice(0, 10);

  const { data: candidatures } = await supabase
    .from("candidatures")
    .select("offre_id")
    .eq("user_id", userId);
  const idsAConserver = (candidatures ?? []).map((c) => c.offre_id);

  let requete = supabase
    .from("offres")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .in("source", ["france_travail", "apec"])
    .lt("date_publication", seuilStr);

  if (idsAConserver.length > 0) {
    requete = requete.not("id", "in", `(${idsAConserver.join(",")})`);
  }

  const { count } = await requete;
  return count ?? 0;
}

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
  const demarrage = Date.now();
  const appelant = await resolveAppelant(request);

  if ("error" in appelant) {
    return NextResponse.json({ error: appelant.error }, { status: 401 });
  }

  const { supabase, userId } = appelant;

  const body = await request.json().catch(() => ({}));
  const motsClesListe: string[] = body.motsCles
    ? [body.motsCles]
    : selectionnerLotMotsCles(TOUS_MOTS_CLES, TAILLE_LOT_MOTS_CLES, Date.now(), VINGT_MINUTES_MS);
  const departements: string[] = body.departements ?? DEPARTEMENTS_IDF;

  const offresParId = new Map<string, OffreInsert>();
  const erreurs: string[] = [];
  const titresEcartes = new Map<string, string>();

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
          if (estOffreHorsCible(offre.intitule)) {
            titresEcartes.set(offre.id, offre.intitule);
            continue;
          }
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
  // Échantillon des titres écartés renvoyé dans la réponse : permet de
  // repérer d'un coup d'œil un motif trop large qui écarterait à tort.
  const ecartees = {
    ecartees: titresEcartes.size,
    echantillonEcartees: Array.from(titresEcartes.values()).slice(0, 10),
  };

  // La vérification ne doit jamais faire échouer la synchro : une erreur ici
  // est simplement signalée dans la réponse.
  async function verifier(): Promise<BilanVerification & { erreur?: string }> {
    try {
      return await retirerOffresCloturees(supabase, userId, demarrage);
    } catch (e) {
      return { verifiees: 0, cloturees: 0, inconnues: 0, erreur: e instanceof Error ? e.message : "erreur inconnue" };
    }
  }

  if (offres.length === 0) {
    const verification = await verifier();
    const purgees = await purgerOffresPerimees(supabase, userId);
    return NextResponse.json(
      { inserted: 0, purgees, verification, ...ecartees, erreurs },
      { status: erreurs.length > 0 ? 502 : 200 },
    );
  }

  const { error, count } = await supabase
    .from("offres")
    .upsert(offres, { onConflict: "user_id,source,source_id", count: "exact" });

  if (error) {
    return NextResponse.json({ error: error.message, erreurs }, { status: 500 });
  }

  const verification = await verifier();
  const purgees = await purgerOffresPerimees(supabase, userId);

  return NextResponse.json({ synced: count ?? offres.length, purgees, verification, ...ecartees, erreurs });
}
