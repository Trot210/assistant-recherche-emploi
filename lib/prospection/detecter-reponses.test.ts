import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReponseBrute } from "@/lib/prospection/reponses";

const lire = vi.fn();
const classer = vi.fn();
vi.mock("@/lib/mail/imap", () => ({ lireReponsesCandidates: (...a: unknown[]) => lire(...a) }));
vi.mock("@/lib/anthropic/reponses", () => ({ classerReponse: (...a: unknown[]) => classer(...a) }));

const { detecterReponses, reponsesEnAttente } = await import("./detecter-reponses");

// Faux client Supabase : chaque table renvoie ses lignes, les upserts sont enregistrés.
function fauxSupabase(tables: Record<string, unknown[]>) {
  const upserts: { table: string; lignes: unknown[] }[] = [];
  const client = {
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        not: () => q,
        order: () => q,
        limit: () => q,
        upsert: (lignes: unknown[]) => {
          upserts.push({ table, lignes });
          return Promise.resolve({ error: null });
        },
        then: (resolve: (v: unknown) => void) => resolve({ data: tables[table] ?? [], error: null }),
      };
      return q;
    },
  };
  return { client: client as never, upserts };
}

const envoi = { id: "p1", parent_id: null, smtp_message_id: "<orig@x>", date_envoi: "2026-10-30", contact_id: "c1", entreprise_id: "e1", type: "initial" };
const tables = {
  prospections: [envoi],
  contacts: [{ id: "c1", nom: "Contact Un", email: "contact@societe-test.example" }],
  entreprises: [{ id: "e1", nom: "Société Test" }],
  reponses_traitees: [],
  reponses_detectees: [] as unknown[],
};

function reponse(id: string, surcharge: Partial<ReponseBrute> = {}): ReponseBrute {
  return {
    messageId: id,
    inReplyTo: "orig@x",
    references: [],
    fromEmail: "contact@societe-test.example",
    fromNom: "Contact Un",
    date: new Date("2026-11-02T10:00:00Z"),
    sujet: "Re: candidature",
    texte: "Merci pour votre message.",
    ...surcharge,
  };
}

const classement = { type: "pas_de_poste", resume: "Pas de poste.", urls: [], ne_plus_contacter: false };

beforeEach(() => {
  lire.mockReset();
  classer.mockReset();
  classer.mockResolvedValue(classement);
});

describe("detecterReponses", () => {
  it("classe une nouvelle réponse et la mémorise", async () => {
    lire.mockResolvedValue([reponse("m1")]);
    const { client, upserts } = fauxSupabase({ ...tables });
    const r = await detecterReponses(client, "u1", { maxClassements: 4, claudeDisponible: true });
    expect(r.propositions).toHaveLength(1);
    expect(r.propositions[0]).toMatchObject({ message_id: "m1", prospection_id: "p1", entreprise: "Société Test" });
    expect(classer).toHaveBeenCalledTimes(1);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].table).toBe("reponses_detectees");
  });

  it("reprend le classement mémorisé sans rappeler Claude", async () => {
    lire.mockResolvedValue([reponse("m1")]);
    const memorisee = { message_id: "m1", prospection_id: "p1", entreprise: "Société Test", classement };
    const { client, upserts } = fauxSupabase({ ...tables, reponses_detectees: [{ message_id: "m1", proposition: memorisee }] });
    const r = await detecterReponses(client, "u1", { maxClassements: 4, claudeDisponible: true });
    expect(r.propositions).toHaveLength(1);
    expect(classer).not.toHaveBeenCalled();
    expect(upserts).toHaveLength(0);
  });

  it("borne le nombre de classements et ne mémorise pas les réponses non classées", async () => {
    lire.mockResolvedValue([reponse("m1"), reponse("m2"), reponse("m3")]);
    const { client, upserts } = fauxSupabase({ ...tables });
    const r = await detecterReponses(client, "u1", { maxClassements: 2, claudeDisponible: true });
    expect(r.propositions).toHaveLength(3);
    expect(classer).toHaveBeenCalledTimes(2);
    expect(r.propositions.filter((p) => p.classement.resume.startsWith("Non classé"))).toHaveLength(1);
    expect((upserts[0].lignes as unknown[]).length).toBe(2);
  });

  it("ne classe rien quand le plafond Claude est atteint", async () => {
    lire.mockResolvedValue([reponse("m1")]);
    const { client, upserts } = fauxSupabase({ ...tables });
    const r = await detecterReponses(client, "u1", { maxClassements: 4, claudeDisponible: false });
    expect(classer).not.toHaveBeenCalled();
    expect(r.propositions[0].classement.resume).toMatch(/plafond/);
    expect(upserts).toHaveLength(0);
  });

  it("laisse les messages automatiques hors de Claude et écarte les réponses déjà traitées", async () => {
    lire.mockResolvedValue([reponse("m1", { fromEmail: "no-reply@societe-test.example" }), reponse("m2")]);
    const { client } = fauxSupabase({ ...tables, reponses_traitees: [{ message_id: "m2" }] });
    const r = await detecterReponses(client, "u1", { maxClassements: 4, claudeDisponible: true });
    expect(classer).not.toHaveBeenCalled();
    expect(r.propositions).toHaveLength(1);
    expect(r.propositions[0].classement.type).toBe("automatique");
    expect(r.dejaTraites).toBe(1);
  });

  it("ne lit pas la boîte mail sans adresse de contact", async () => {
    const { client } = fauxSupabase({ ...tables, contacts: [] });
    const r = await detecterReponses(client, "u1", { maxClassements: 4, claudeDisponible: true });
    expect(lire).not.toHaveBeenCalled();
    expect(r.propositions).toEqual([]);
  });
});

describe("reponsesEnAttente", () => {
  it("renvoie les réponses mémorisées non traitées, sans les messages automatiques", async () => {
    const p = (id: string, type: string) => ({ message_id: id, proposition: { message_id: id, classement: { type } } });
    const { client } = fauxSupabase({
      reponses_detectees: [p("a", "refus"), p("b", "offre"), p("c", "automatique")],
      reponses_traitees: [{ message_id: "b" }],
    });
    const r = await reponsesEnAttente(client, "u1");
    expect(r.map((x) => x.message_id)).toEqual(["a"]);
  });
});
