import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Dashboard from "@/components/Dashboard";
import type { OffreAvecDetails } from "@/types/dashboard";

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
  const [{ data: offres }, { data: scores }, { data: candidatures }] = await Promise.all([
    supabase
      .from("offres")
      .select(
        "id, user_id, titre, entreprise, source, source_id, lien_original, localisation, date_publication, created_at, type_contrat, type_contrat_libelle, alternance, stage",
      )
      .order("date_publication", { ascending: false }),
    supabase.from("scores").select(),
    supabase.from("candidatures").select(),
  ]);

  const scoresParOffre = new Map((scores ?? []).map((s) => [s.offre_id, s]));
  const candidaturesParOffre = new Map((candidatures ?? []).map((c) => [c.offre_id, c]));

  const offresAvecDetails: OffreAvecDetails[] = (offres ?? []).map((offre) => ({
    ...offre,
    // Non chargée à cette étape (voir commentaire plus haut) — undefined
    // sert de marqueur "pas encore récupérée", distinct de null ("offre
    // sans description").
    description: undefined,
    score: scoresParOffre.get(offre.id) ?? null,
    candidature: candidaturesParOffre.get(offre.id) ?? null,
  }));

  return <Dashboard offres={offresAvecDetails} userEmail={user.email ?? ""} />;
}
