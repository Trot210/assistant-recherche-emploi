import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAvecUsage, lireBilanUsage, ouvrirUsage, plafondAtteint } from "@/lib/anthropic/usage";

// Faux client Supabase : enregistre les insertions et renvoie des lignes prédéfinies.
function fauxSupabase(lignes: { fonction: string; cout_usd: number }[], plafond?: number) {
  const insertions: Record<string, unknown>[] = [];
  const client = {
    from(table: string) {
      if (table === "usage_ia") {
        return {
          select: () => ({ eq: () => ({ gte: async () => ({ data: lignes }) }) }),
          insert: async (ligne: Record<string, unknown>) => {
            insertions.push(ligne);
            return { error: null };
          },
        };
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: plafond === undefined ? null : { plafond_claude_usd: plafond } }) }),
        }),
      };
    },
  };
  return { client: client as never, insertions };
}

afterEach(() => vi.unstubAllGlobals());

describe("lireBilanUsage", () => {
  it("additionne la dépense du mois par fonction et lit le plafond", async () => {
    const { client } = fauxSupabase(
      [
        { fonction: "prospection", cout_usd: 0.02 },
        { fonction: "prospection", cout_usd: 0.03 },
        { fonction: "fiche", cout_usd: 0.1 },
      ],
      5,
    );
    const bilan = await lireBilanUsage(client, "u1");
    expect(bilan.depenseMoisUsd).toBeCloseTo(0.15, 5);
    expect(bilan.plafondUsd).toBe(5);
    expect(bilan.appels).toBe(3);
    expect(bilan.parFonction[0]).toMatchObject({ fonction: "fiche", appels: 1 });
  });

  it("applique le plafond par défaut quand rien n'est réglé", async () => {
    const { client } = fauxSupabase([]);
    expect((await lireBilanUsage(client, "u1")).plafondUsd).toBe(3);
  });
});

describe("plafondAtteint", () => {
  it("bloque à partir du plafond, et jamais si le plafond est à zéro (désactivé)", () => {
    expect(plafondAtteint({ depenseMoisUsd: 2.99, plafondUsd: 3 })).toBe(false);
    expect(plafondAtteint({ depenseMoisUsd: 3, plafondUsd: 3 })).toBe(true);
    expect(plafondAtteint({ depenseMoisUsd: 50, plafondUsd: 0 })).toBe(false);
  });
});

describe("ouvrirUsage", () => {
  it("refuse (402) quand le plafond du mois est atteint, et laisse passer sinon", async () => {
    const plein = fauxSupabase([{ fonction: "x", cout_usd: 3.5 }], 3);
    const reponse = await ouvrirUsage(plein.client, "u1", "prospection");
    expect(reponse?.status).toBe(402);
    expect((await reponse?.json()).code).toBe("plafond_claude");

    const libre = fauxSupabase([{ fonction: "x", cout_usd: 0.5 }], 3);
    expect(await ouvrirUsage(libre.client, "u1", "prospection")).toBeNull();
  });
});

describe("fetchAvecUsage", () => {
  it("enregistre l'usage d'un appel /v1/messages sans toucher à la réponse", async () => {
    const { client, insertions } = fauxSupabase([], 3);
    await ouvrirUsage(client, "u1", "fiche");

    const corps = { model: "claude-sonnet-5-5", usage: { input_tokens: 1000, output_tokens: 200, server_tool_use: { web_search_requests: 1 } } };
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(corps), { headers: { "content-type": "application/json" } }));

    const reponse = await fetchAvecUsage("https://api.anthropic.com/v1/messages");
    expect(await reponse.json()).toEqual(corps);
    expect(insertions).toHaveLength(1);
    expect(insertions[0]).toMatchObject({ user_id: "u1", fonction: "fiche", modele: "claude-sonnet-5-5", recherches_web: 1 });
    // 1000 × 2 $/M + 200 × 10 $/M + 1 recherche à 0,01 $
    expect(Number(insertions[0].cout_usd)).toBeCloseTo(0.014, 5);
  });

  it("n'enregistre rien pour une autre adresse ou une erreur", async () => {
    const { client, insertions } = fauxSupabase([], 3);
    await ouvrirUsage(client, "u1", "fiche");

    vi.stubGlobal("fetch", async () => new Response("{}", { headers: { "content-type": "application/json" } }));
    await fetchAvecUsage("https://example.com/autre");
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 500, headers: { "content-type": "application/json" } }));
    await fetchAvecUsage("https://api.anthropic.com/v1/messages");
    expect(insertions).toHaveLength(0);
  });
});
