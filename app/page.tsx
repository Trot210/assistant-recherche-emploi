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

  const [{ data: offres }, { data: scores }, { data: candidatures }] = await Promise.all([
    supabase.from("offres").select().order("date_publication", { ascending: false }),
    supabase.from("scores").select(),
    supabase.from("candidatures").select(),
  ]);

  const scoresParOffre = new Map((scores ?? []).map((s) => [s.offre_id, s]));
  const candidaturesParOffre = new Map((candidatures ?? []).map((c) => [c.offre_id, c]));

  const offresAvecDetails: OffreAvecDetails[] = (offres ?? []).map((offre) => ({
    ...offre,
    score: scoresParOffre.get(offre.id) ?? null,
    candidature: candidaturesParOffre.get(offre.id) ?? null,
  }));

  return <Dashboard offres={offresAvecDetails} userEmail={user.email ?? ""} />;
}
