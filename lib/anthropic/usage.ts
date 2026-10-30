import { AsyncLocalStorage } from "node:async_hooks";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { coutEstimeUsd, debutMoisParis, formaterUsd, mesurerUsage, type UsageApi } from "@/lib/anthropic/tarifs";

// Chaque appel à Claude laisse une ligne dans usage_ia (jetons, recherches web,
// coût estimé). Le client Anthropic passe par `fetchAvecUsage` : aucune route ne
// compte à la main, et un appel oublié ne peut pas échapper au total. La route
// indique seulement QUI appelle (`ouvrirUsage`), ce qui permet aussi de bloquer
// les nouveaux appels une fois le plafond mensuel atteint.
interface ContexteUsage {
  supabase: SupabaseClient<Database>;
  userId: string;
  fonction: string;
}

const contexte = new AsyncLocalStorage<ContexteUsage>();

export const PLAFOND_PAR_DEFAUT_USD = 3;

export interface BilanUsage {
  depenseMoisUsd: number;
  plafondUsd: number;
  appels: number;
  parFonction: { fonction: string; coutUsd: number; appels: number }[];
}

export async function lireBilanUsage(
  supabase: SupabaseClient<Database>,
  userId: string,
  maintenant = new Date(),
): Promise<BilanUsage> {
  const [{ data: lignes }, { data: reglages }] = await Promise.all([
    supabase.from("usage_ia").select("fonction, cout_usd").eq("user_id", userId).gte("created_at", debutMoisParis(maintenant)),
    supabase.from("reglages").select("plafond_claude_usd").eq("user_id", userId).maybeSingle(),
  ]);

  const parFonction = new Map<string, { coutUsd: number; appels: number }>();
  let depense = 0;
  for (const l of lignes ?? []) {
    const cout = Number(l.cout_usd);
    depense += cout;
    const courant = parFonction.get(l.fonction) ?? { coutUsd: 0, appels: 0 };
    parFonction.set(l.fonction, { coutUsd: courant.coutUsd + cout, appels: courant.appels + 1 });
  }

  return {
    depenseMoisUsd: Math.round(depense * 100_000) / 100_000,
    plafondUsd: reglages ? Number(reglages.plafond_claude_usd) : PLAFOND_PAR_DEFAUT_USD,
    appels: lignes?.length ?? 0,
    parFonction: [...parFonction.entries()]
      .map(([fonction, v]) => ({ fonction, ...v }))
      .sort((a, b) => b.coutUsd - a.coutUsd),
  };
}

export function plafondAtteint(bilan: Pick<BilanUsage, "depenseMoisUsd" | "plafondUsd">): boolean {
  return bilan.plafondUsd > 0 && bilan.depenseMoisUsd >= bilan.plafondUsd;
}

// Indique quel utilisateur et quelle fonction sont derrière les prochains appels
// à Claude de cette requête. `fonction` nomme l'usage dans le bilan.
export function suivreUsage(supabase: SupabaseClient<Database>, userId: string, fonction: string): void {
  contexte.enterWith({ supabase, userId, fonction });
}

// À appeler dans une route une fois l'utilisateur identifié, avant tout appel à
// Claude. Renvoie une réponse d'erreur à retourner telle quelle quand le
// plafond mensuel est atteint, sinon null.
export async function ouvrirUsage(
  supabase: SupabaseClient<Database>,
  userId: string,
  fonction: string,
): Promise<NextResponse | null> {
  suivreUsage(supabase, userId, fonction);
  try {
    const bilan = await lireBilanUsage(supabase, userId);
    if (plafondAtteint(bilan)) {
      return NextResponse.json(
        {
          error: `Plafond mensuel Claude atteint (${formaterUsd(bilan.depenseMoisUsd)} sur ${formaterUsd(bilan.plafondUsd)}). Relève le plafond dans les réglages pour continuer.`,
          code: "plafond_claude",
        },
        { status: 402 },
      );
    }
  } catch (e) {
    // Le suivi est un garde-fou : s'il est indisponible (migration pas encore appliquée),
    // il ne doit pas empêcher l'application de fonctionner.
    console.error("Suivi du coût Claude indisponible:", e);
  }
  return null;
}

async function enregistrer(c: ContexteUsage, modele: string, usage: UsageApi | undefined) {
  const mesure = mesurerUsage(usage);
  const { error } = await c.supabase.from("usage_ia").insert({
    user_id: c.userId,
    fonction: c.fonction,
    modele,
    tokens_entree: mesure.tokensEntree,
    tokens_sortie: mesure.tokensSortie,
    tokens_cache_lecture: mesure.tokensCacheLecture,
    tokens_cache_ecriture: mesure.tokensCacheEcriture,
    recherches_web: mesure.recherchesWeb,
    cout_usd: coutEstimeUsd(modele, mesure),
  });
  if (error) console.error("Enregistrement du coût Claude impossible:", error.message);
}

// fetch du client Anthropic : laisse la réponse intacte et en relève l'usage.
export const fetchAvecUsage: typeof fetch = async (entree, init) => {
  const reponse = await fetch(entree, init);
  const c = contexte.getStore();
  if (!c || !reponse.ok) return reponse;

  const url = typeof entree === "string" ? entree : entree instanceof URL ? entree.href : entree.url;
  if (!/\/v1\/messages(\?|$)/.test(url) || !(reponse.headers.get("content-type") ?? "").includes("json")) return reponse;

  try {
    const corps = (await reponse.clone().json()) as { model?: string; usage?: UsageApi };
    if (corps.usage) await enregistrer(c, corps.model ?? "inconnu", corps.usage);
  } catch (e) {
    console.error("Lecture de l'usage Claude impossible:", e);
  }
  return reponse;
};
