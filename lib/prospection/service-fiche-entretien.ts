import type { SupabaseClient } from "@supabase/supabase-js";
import { genererFicheEntretien } from "@/lib/anthropic/fiche-entretien";
import { resumerFiche } from "@/lib/prospection/fiche";
import type { FicheEntretien } from "@/lib/prospection/fiche-entretien";
import type { Database } from "@/types/database.types";

export type ResultatFiche = { fiche: FicheEntretien } | { erreur: string; statut: number };

// Prépare (et garde en base) la fiche d'un entretien. Utilisé par le bouton « Préparer l'entretien » et par le
// traitement du matin, avec les mêmes garde-fous. Un seul appel à Claude, quelques centimes.
export async function preparerFicheEntretien(supabase: SupabaseClient<Database>, userId: string, ligneId: string): Promise<ResultatFiche> {
  const { data: ligne, error } = await supabase
    .from("courrier_candidatures")
    .select("id, nature, expediteur, sujet, resume, date_mail, prospection_id")
    .eq("id", ligneId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { erreur: error.message, statut: 500 };
  if (!ligne || ligne.nature !== "entretien") return { erreur: "Invitation à un entretien introuvable", statut: 404 };

  const { data: profil } = await supabase.from("profil").select().eq("user_id", userId).maybeSingle();
  if (!profil) return { erreur: "Profil non renseigné", statut: 409 };

  let ficheEntreprise: string | undefined;
  if (ligne.prospection_id) {
    const { data: prospection } = await supabase.from("prospections").select("entreprise_id").eq("id", ligne.prospection_id).eq("user_id", userId).maybeSingle();
    if (prospection) {
      const { data: entreprise } = await supabase.from("entreprises").select().eq("id", prospection.entreprise_id).eq("user_id", userId).maybeSingle();
      ficheEntreprise = entreprise ? resumerFiche(entreprise.fiche) || undefined : undefined;
    }
  }

  const fiche = await genererFicheEntretien({
    profil,
    expediteur: ligne.expediteur,
    sujet: ligne.sujet,
    resume: ligne.resume,
    dateMail: ligne.date_mail,
    ficheEntreprise,
  });

  const { error: ecriture } = await supabase
    .from("courrier_candidatures")
    .update({ fiche_entretien: fiche as unknown as Database["public"]["Tables"]["courrier_candidatures"]["Row"]["fiche_entretien"], fiche_entretien_at: new Date().toISOString() })
    .eq("id", ligne.id)
    .eq("user_id", userId);
  if (ecriture) return { erreur: `Fiche rédigée mais non enregistrée (migration 0028 appliquée ?) : ${ecriture.message}`, statut: 500 };
  return { fiche };
}
