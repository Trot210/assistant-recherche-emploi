import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lireBilanUsage } from "@/lib/anthropic/usage";
import { hunterConfigure, lireQuotaHunter, type QuotaHunter } from "@/lib/hunter/client";

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

  return NextResponse.json({ claude, hunter });
}

// Plafond mensuel de dépense Claude, en dollars (0 = pas de plafond).
export async function PUT(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const corps = await request.json().catch(() => null);
  const plafond: unknown = corps?.plafond_claude_usd;
  if (typeof plafond !== "number" || !Number.isFinite(plafond) || plafond < 0 || plafond > 1000) {
    return NextResponse.json({ error: "plafond_claude_usd doit être un nombre entre 0 et 1000" }, { status: 400 });
  }

  const { error } = await supabase.from("reglages").upsert(
    { user_id: user.id, plafond_claude_usd: Math.round(plafond * 100) / 100, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
