import type { SupabaseClient } from "@supabase/supabase-js";
import { lireCvReference } from "@/lib/prospection/cv";
import { premierBlocage } from "@/lib/prospection/politique";
import type { Database } from "@/types/database.types";
import type { Prospection } from "@/types/prospection";

// Vérifie, au moment de programmer, qu'un message pourra partir : validé, avec un
// destinataire joignable et non exclu, et le CV de sa langue enregistré. Mieux vaut
// refuser tout de suite qu'échouer à 9 h du matin. Les mêmes contrôles sont refaits
// à l'envoi (lib/prospection/envoi.ts) : l'état peut changer entre-temps.
export async function verifierProgrammable(
  supabase: SupabaseClient<Database>,
  userId: string,
  prospection: Prospection,
  joindreCv = true,
): Promise<string | null> {
  if (prospection.statut !== "valide") return "Seul un message validé peut être programmé : relis-le et valide-le d'abord";

  const [{ data: contact }, { data: entreprise }] = await Promise.all([
    prospection.contact_id
      ? supabase.from("contacts").select().eq("id", prospection.contact_id).eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("entreprises").select("nom, politique_candidature").eq("id", prospection.entreprise_id).eq("user_id", userId).maybeSingle(),
  ]);

  if (!contact?.email) return "Ce message n'a pas de destinataire avec une adresse e-mail";
  const blocage = entreprise ? premierBlocage(entreprise, contact) : null;
  if (blocage?.niveau === "interdit") return blocage.raison;

  if (joindreCv && !(await lireCvReference(supabase, userId, prospection.langue))) {
    return `Aucun CV ${prospection.langue === "en" ? "anglais" : "français"} n'est enregistré : ajoute-le avant de programmer`;
  }
  return null;
}
