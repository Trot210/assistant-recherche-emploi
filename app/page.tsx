import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Dashboard from "@/components/Dashboard";
import type { OffreAvecDetails } from "@/types/dashboard";

// PostgREST plafonne chaque requête à 1000 lignes par défaut — silencieusement,
// sans erreur. Le catalogue d'offres a dépassé ce seuil (~5000 lignes), donc
// une simple .select() tronquait la liste et faisait disparaître du dashboard
// les offres les plus anciennes, y compris celles liées à une candidature
// suivie. On repage jusqu'à épuisement pour charger l'intégralité des lignes.
async function chargerToutesLesLignes<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const TAILLE_PAGE = 1000;
  const lignes: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await page(offset, offset + TAILLE_PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    lignes.push(...data);
    if (data.length < TAILLE_PAGE) break;
    offset += TAILLE_PAGE;
  }
  return lignes;
}

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // La description complète n'est pas chargée ici : c'est souvent le plus
  // gros champ de chaque offre, et elle n'est utile que dans le panneau de
  // détail d'une seule offre à la fois — voir /api/offres/[id], appelée à la
  // demande par le dashboard quand une offre est ouverte.
  const [offres, scores, candidatures] = await Promise.all([
    chargerToutesLesLignes((from, to) =>
      supabase
        .from("offres")
        .select(
          "id, user_id, titre, entreprise, source, source_id, lien_original, localisation, date_publication, created_at, type_contrat, type_contrat_libelle, alternance, stage",
        )
        .order("date_publication", { ascending: false })
        .range(from, to),
    ),
    chargerToutesLesLignes((from, to) =>
      supabase.from("scores").select().order("id", { ascending: true }).range(from, to),
    ),
    chargerToutesLesLignes((from, to) =>
      supabase.from("candidatures").select().order("id", { ascending: true }).range(from, to),
    ),
  ]);

  const scoresParOffre = new Map(scores.map((s) => [s.offre_id, s]));
  const candidaturesParOffre = new Map(candidatures.map((c) => [c.offre_id, c]));

  const offresAvecDetails: OffreAvecDetails[] = offres.map((offre) => ({
    ...offre,
    // Non chargée à cette étape (voir commentaire plus haut) — undefined
    // sert de marqueur "pas encore récupérée", distinct de null ("offre
    // sans description").
    description: undefined,
    score: scoresParOffre.get(offre.id) ?? null,
    candidature: candidaturesParOffre.get(offre.id) ?? null,
  }));

  return <Dashboard offres={offresAvecDetails} />;
}
