import type { SupabaseClient } from "@supabase/supabase-js";
import { genererRelance } from "@/lib/anthropic/prospection";
import { blocageContact, blocageEntreprise } from "@/lib/prospection/politique";
import { estEnCours, MAX_RELANCES } from "@/lib/prospection/workflow";
import type { Database } from "@/types/database.types";
import type { Profil } from "@/types/profil";
import type { Prospection } from "@/types/prospection";

export type ResultatRelance =
  | { prospection: Prospection }
  | { erreur: string; statut: number; code?: string };

// Prépare le brouillon de la relance d'un message envoyé (jamais son envoi) : il
// arrive « à valider ». Utilisé par le bouton « Préparer la relance » et par le
// traitement du matin, avec exactement les mêmes garde-fous.
export async function preparerRelance(
  supabase: SupabaseClient<Database>,
  userId: string,
  parentId: string,
  profil: Profil,
): Promise<ResultatRelance> {
  const { data: initial, error } = await supabase
    .from("prospections")
    .select()
    .eq("id", parentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { erreur: error.message, statut: 500 };
  if (!initial || initial.type !== "initial") return { erreur: "Message initial introuvable", statut: 404 };
  if (initial.statut !== "envoyee") {
    return { erreur: "Seul un message envoyé sans réponse peut être relancé", statut: 409 };
  }
  if (initial.nb_relances >= MAX_RELANCES) {
    return { erreur: `Déjà ${MAX_RELANCES} relances envoyées`, statut: 409 };
  }

  const { data: enCours } = await supabase
    .from("prospections")
    .select("id, statut")
    .eq("parent_id", initial.id)
    .eq("user_id", userId);
  if ((enCours ?? []).some((r) => estEnCours(r.statut))) {
    return { erreur: "Une relance est déjà en préparation pour ce message", statut: 409 };
  }

  const [{ data: entreprise }, { data: contact }] = await Promise.all([
    supabase.from("entreprises").select().eq("id", initial.entreprise_id).eq("user_id", userId).single(),
    initial.contact_id
      ? supabase.from("contacts").select().eq("id", initial.contact_id).eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!entreprise) return { erreur: "Entreprise introuvable", statut: 404 };

  // Une relance ne s'adresse pas à qui a demandé à ne plus être contacté.
  const interdit = [blocageContact(contact), blocageEntreprise(entreprise)].find((b) => b?.niveau === "interdit");
  if (interdit) return { erreur: interdit.raison, statut: 409, code: "bloque" };

  const genere = await genererRelance({ profil, entreprise, contact, initial, numero: initial.nb_relances + 1 });

  const { data: prospection, error: insertError } = await supabase
    .from("prospections")
    .insert({
      user_id: userId,
      entreprise_id: initial.entreprise_id,
      contact_id: initial.contact_id,
      parent_id: initial.id,
      type: "relance",
      poste_vise: initial.poste_vise,
      langue: initial.langue,
      gmail_thread_id: initial.gmail_thread_id,
      ...genere,
    })
    .select()
    .single();

  if (insertError) return { erreur: insertError.message, statut: 500 };
  return { prospection };
}
