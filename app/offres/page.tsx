import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Dashboard from "@/components/Dashboard";

// Le chargement des offres (filtrage, tri, pagination) se fait côté client via la
// RPC offres_filtrees (voir components/Dashboard.tsx) : cette page ne fait que
// vérifier la session avant de rendre le dashboard, qui va chercher ses propres données.
export default async function Offres() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <Dashboard />;
}
