import { createClient } from "@/lib/supabase/server";
import type { Profil } from "@/types/profil";
import type { Offre } from "@/types/offre";
import type { User } from "@supabase/supabase-js";

type ResolutionEchouee = { error: string; status: number };
type ResolutionReussie = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User;
  profil: Profil;
  offre: Offre;
};

// Boilerplate partagé par les routes qui agissent sur une offre précise du
// candidat connecté (scoring, génération CV/lettre/message) : authentifie
// l'utilisateur, charge son profil et vérifie qu'il est bien propriétaire
// de l'offre demandée.
export async function resolveProfilEtOffre(
  offreId: string,
): Promise<ResolutionReussie | ResolutionEchouee> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Non authentifié", status: 401 };
  }

  const [{ data: profil, error: profilError }, { data: offre, error: offreError }] =
    await Promise.all([
      supabase.from("profil").select().eq("user_id", user.id).maybeSingle(),
      supabase.from("offres").select().eq("id", offreId).eq("user_id", user.id).maybeSingle(),
    ]);

  if (profilError) {
    return { error: profilError.message, status: 500 };
  }
  if (offreError) {
    return { error: offreError.message, status: 500 };
  }
  if (!profil) {
    return {
      error: "Profil non renseigné — remplis-le via PUT /api/profil avant de continuer",
      status: 400,
    };
  }
  if (!offre) {
    return { error: "Offre introuvable", status: 404 };
  }

  return { supabase, user, profil, offre };
}
