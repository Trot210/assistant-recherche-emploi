import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// L'accueil, c'est « Aujourd'hui » : ce qu'il y a à faire ce matin. Les offres vivent
// sur /offres ; un ancien lien direct vers une offre (/?offre=...) y est renvoyé.
export default async function Home({ searchParams }: { searchParams: Promise<{ offre?: string }> }) {
  const { offre } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (offre && /^[0-9a-f-]{36}$/i.test(offre)) redirect(`/offres?offre=${offre}`);
  redirect("/aujourdhui");
}
