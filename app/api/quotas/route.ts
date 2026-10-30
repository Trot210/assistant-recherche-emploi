import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lireBilanUsage } from "@/lib/anthropic/usage";
import { hunterConfigure, lireQuotaHunter, type QuotaHunter } from "@/lib/hunter/client";
import type { Database } from "@/types/database.types";

// Ce qu'il reste à dépenser : coût estimé de Claude ce mois-ci (avec le plafond
// choisi) et crédits Hunter. Hunter est facultatif et son compte se lit sans
// consommer de crédit.
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let claude = null;
  try {
    claude = await lireBilanUsage(supabase, user.id);
  } catch (e) {
    console.error("Bilan Claude indisponible:", e);
  }

  let hunter: QuotaHunter | null = null;
  if (hunterConfigure()) {
    hunter = await lireQuotaHunter().catch(() => null);
  }

  const { data: reglages } = await supabase
    .from("reglages")
    .select("relances_auto, recap_actif")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    claude,
    hunter,
    // Sans ligne de réglages, les options automatiques sont activées par défaut.
    reglages: { relances_auto: reglages?.relances_auto ?? true, recap_actif: reglages?.recap_actif ?? true },
  });
}

// Réglages : plafond mensuel de dépense Claude en dollars (0 = pas de plafond), et
// options du traitement quotidien. Seuls les champs présents sont modifiés.
export async function PUT(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const corps = await request.json().catch(() => null);
  const patch: Database["public"]["Tables"]["reglages"]["Insert"] = { user_id: user.id, updated_at: new Date().toISOString() };

  if (corps?.plafond_claude_usd !== undefined) {
    const plafond: unknown = corps.plafond_claude_usd;
    if (typeof plafond !== "number" || !Number.isFinite(plafond) || plafond < 0 || plafond > 1000) {
      return NextResponse.json({ error: "plafond_claude_usd doit être un nombre entre 0 et 1000" }, { status: 400 });
    }
    patch.plafond_claude_usd = Math.round(plafond * 100) / 100;
  }
  for (const cle of ["relances_auto", "recap_actif"] as const) {
    if (corps?.[cle] === undefined) continue;
    if (typeof corps[cle] !== "boolean") return NextResponse.json({ error: `${cle} doit être vrai ou faux` }, { status: 400 });
    patch[cle] = corps[cle];
  }
  if (Object.keys(patch).length === 2) return NextResponse.json({ error: "Aucun réglage à modifier" }, { status: 400 });

  const { error } = await supabase.from("reglages").upsert(patch, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
