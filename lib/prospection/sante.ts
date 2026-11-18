import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// Santé de l'automatisation : le tri des mails passe toutes les dix minutes et laisse une trace. Si cette
// trace vieillit, ou si le dernier passage a échoué, on le dit (récapitulatif du matin, bandeau du site) au lieu
// de laisser croire que « rien de nouveau » veut dire « tout va bien ». Calcul pur + une écriture tolérante.

// Le tri passe toutes les 10 minutes : une heure sans passage n'est plus un simple retard.
export const DELAI_PANNE_MINUTES = 60;

export interface EtatPassage {
  dernierPassage: string | null;
  derniereErreur: string | null;
}

function dureeLisible(minutes: number): string {
  if (minutes < 120) return `${minutes} minutes`;
  const heures = Math.round(minutes / 60);
  return heures < 48 ? `${heures} heures` : `${Math.round(heures / 24)} jours`;
}

// Alertes à afficher, en français, dans l'ordre d'importance. Liste vide : tout va bien (ou rien n'est encore enregistré).
export function diagnostiquerSante(etat: EtatPassage, maintenant = new Date()): string[] {
  const alertes: string[] = [];
  if (!etat.dernierPassage) return alertes;
  const passage = new Date(etat.dernierPassage).getTime();
  if (Number.isNaN(passage)) return alertes;

  const minutes = Math.floor((maintenant.getTime() - passage) / 60_000);
  if (minutes > DELAI_PANNE_MINUTES) {
    alertes.push(`Le tri automatique des mails ne s'est pas exécuté depuis ${dureeLisible(minutes)} : les nouveaux mails ne sont plus rangés.`);
  }
  const erreur = etat.derniereErreur?.trim();
  if (erreur) alertes.push(`Le dernier passage du tri des mails a rencontré un problème : ${erreur}`);
  return alertes;
}

// Résumé d'un passage : l'erreur (courte) ou null si tout s'est bien passé.
export function resumerErreurs(erreurs: string[]): string | null {
  const utiles = erreurs.map((e) => e.trim()).filter(Boolean);
  if (utiles.length === 0) return null;
  return utiles.join(" ; ").slice(0, 300);
}

// Enregistre le passage qui vient d'avoir lieu. Jamais bloquant : si les colonnes n'existent pas encore
// (migration 0028 pas appliquée), l'erreur est ignorée et le tri continue comme avant.
export async function enregistrerPassage(supabase: SupabaseClient<Database>, userId: string, erreur: string | null): Promise<void> {
  try {
    await supabase
      .from("reglages")
      .upsert({ user_id: userId, courrier_passage_at: new Date().toISOString(), courrier_passage_erreur: erreur }, { onConflict: "user_id" });
  } catch {
    /* sans colonne ou sans réseau : on ne bloque jamais le tri pour une trace */
  }
}

// Lecture tolérante (colonnes absentes : aucune alerte).
export async function lireEtatPassage(supabase: SupabaseClient<Database>, userId: string): Promise<EtatPassage> {
  const { data, error } = await supabase.from("reglages").select("courrier_passage_at, courrier_passage_erreur").eq("user_id", userId).maybeSingle();
  if (error || !data) return { dernierPassage: null, derniereErreur: null };
  return { dernierPassage: data.courrier_passage_at, derniereErreur: data.courrier_passage_erreur };
}
