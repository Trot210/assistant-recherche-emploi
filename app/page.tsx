import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Dashboard from "@/components/Dashboard";

// Le chargement des offres (filtrage, tri, pagination) se fait désormais
// côté client via la RPC offres_filtrees (voir components/Dashboard.tsx) —
// cette page ne fait plus que vérifier la session avant de rendre le
// dashboard, qui va chercher ses propres données.
export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <Dashboard />;
}
