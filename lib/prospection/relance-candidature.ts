import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// Candidatures sur offres (suivi des offres) restées sans nouvelles : on propose une relance, jamais plus. Les
// candidatures spontanées ont déjà leur propre circuit de relances (onglet « Relances »). Calcul pur + lecture.

// Relance envisageable à partir de 10 jours sans nouvelles ; au-delà de 30 jours, la candidature est considérée
// comme classée (on ne la propose plus, pour ne pas harceler ni encombrer le récapitulatif du matin).
export const JOURS_AVANT_RELANCE = 10;
export const JOURS_MAX_RELANCE = 30;

export interface LigneCandidature {
  id: string;
  statut: string;
  date_envoi: string | null;
  derniere_relance_at: string | null;
  titre: string;
  entreprise: string;
  lien: string | null;
}

export interface CandidatureARelancer {
  id: string;
  titre: string;
  entreprise: string;
  lien: string | null;
  envoyeLe: string;
  jours: number;
}

function joursEcoules(depuis: string, maintenant: Date): number {
  const debut = new Date(`${depuis.slice(0, 10)}T12:00:00Z`).getTime();
  const fin = new Date(`${maintenant.toISOString().slice(0, 10)}T12:00:00Z`).getTime();
  return Math.floor((fin - debut) / 86_400_000);
}

// Seules les candidatures « envoyée » ou « réponse reçue » (simple accusé de réception) sans entretien, refus ni
// offre sont concernées ; une candidature déjà relancée (ou écartée par l'utilisateur) ne revient pas.
export function candidaturesARelancer(lignes: LigneCandidature[], maintenant = new Date()): CandidatureARelancer[] {
  const resultat: CandidatureARelancer[] = [];
  for (const l of lignes) {
    if (!["envoyee", "reponse_recue"].includes(l.statut)) continue;
    if (!l.date_envoi || l.derniere_relance_at) continue;
    const jours = joursEcoules(l.date_envoi, maintenant);
    if (jours < JOURS_AVANT_RELANCE || jours > JOURS_MAX_RELANCE) continue;
    resultat.push({ id: l.id, titre: l.titre, entreprise: l.entreprise, lien: l.lien, envoyeLe: l.date_envoi.slice(0, 10), jours });
  }
  return resultat.sort((a, b) => b.jours - a.jours);
}

type LigneBrute = {
  id: string;
  statut: string;
  date_envoi: string | null;
  derniere_relance_at?: string | null;
  offres: { titre: string; entreprise: string | null; lien_original: string | null } | null;
};

// Lecture des candidatures. Si la colonne de relance n'existe pas encore (migration 0028), on lit sans elle : la
// fonction reste utilisable, une candidature relancée pouvant simplement être reproposée.
export async function lireCandidaturesARelancer(
  supabase: SupabaseClient<Database>,
  userId: string,
  maintenant = new Date(),
): Promise<CandidatureARelancer[]> {
  const colonnes = "id, statut, date_envoi, offres(titre, entreprise, lien_original)";
  let { data, error } = (await supabase
    .from("candidatures")
    .select(`${colonnes}, derniere_relance_at`)
    .eq("user_id", userId)
    .in("statut", ["envoyee", "reponse_recue"])) as { data: LigneBrute[] | null; error: unknown };
  if (error) {
    ({ data, error } = (await supabase
      .from("candidatures")
      .select(colonnes)
      .eq("user_id", userId)
      .in("statut", ["envoyee", "reponse_recue"])) as { data: LigneBrute[] | null; error: unknown });
  }
  if (error || !data) return [];
  return candidaturesARelancer(
    data
      .filter((c) => c.offres)
      .map((c) => ({
        id: c.id,
        statut: c.statut,
        date_envoi: c.date_envoi,
        derniere_relance_at: c.derniere_relance_at ?? null,
        titre: c.offres!.titre,
        entreprise: c.offres!.entreprise ?? "Entreprise non précisée",
        lien: c.offres!.lien_original && /^https:\/\//i.test(c.offres!.lien_original) ? c.offres!.lien_original : null,
      })),
    maintenant,
  );
}
