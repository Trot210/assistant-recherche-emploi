import { beforeEach, describe, expect, it, vi } from "vitest";

const envoyerProspection = vi.fn();
vi.mock("@/lib/prospection/envoi", () => ({ envoyerProspection: (...args: unknown[]) => envoyerProspection(...args) }));

import { cloturerProgrammations, executerEnvoisDus } from "@/lib/prospection/programmations";

type Ligne = Record<string, unknown>;

// Mini base en mémoire : assez pour exercer les requêtes du planificateur, y compris la
// réservation conditionnelle qui garantit un seul envoi.
function fauxClient(tables: Record<string, Ligne[]>) {
  class Requete {
    private filtres: ((l: Ligne) => boolean)[] = [];
    private valeurs: Ligne | null = null;
    private limite = Infinity;
    private tri: string | null = null;
    constructor(private table: string) {}
    select() {
      return this;
    }
    update(valeurs: Ligne) {
      this.valeurs = valeurs;
      return this;
    }
    eq(c: string, v: unknown) {
      this.filtres.push((l) => l[c] === v);
      return this;
    }
    in(c: string, vs: unknown[]) {
      this.filtres.push((l) => vs.includes(l[c]));
      return this;
    }
    lt(c: string, v: string) {
      this.filtres.push((l) => String(l[c] ?? "") < v && l[c] != null);
      return this;
    }
    lte(c: string, v: string) {
      this.filtres.push((l) => String(l[c]) <= v);
      return this;
    }
    order(c: string) {
      this.tri = c;
      return this;
    }
    limit(n: number) {
      this.limite = n;
      return this;
    }
    private executer() {
      let lignes = tables[this.table].filter((l) => this.filtres.every((f) => f(l)));
      if (this.tri) lignes = [...lignes].sort((a, b) => String(a[this.tri as string]).localeCompare(String(b[this.tri as string])));
      lignes = lignes.slice(0, this.limite);
      if (this.valeurs) for (const l of lignes) Object.assign(l, this.valeurs);
      // Comme une vraie base : l'appelant reçoit des copies, pas les lignes stockées.
      return lignes.map((l) => ({ ...l }));
    }
    maybeSingle() {
      const l = this.executer();
      return Promise.resolve({ data: l[0] ?? null, error: null });
    }
    single() {
      return this.maybeSingle();
    }
    then<A, B>(ok?: (v: { data: Ligne[]; error: null }) => A, ko?: (r: unknown) => B) {
      return Promise.resolve({ data: this.executer(), error: null }).then(ok as never, ko);
    }
  }
  return { from: (t: string) => new Requete(t), tables } as never;
}

const MAINTENANT = new Date("2026-11-03T09:00:00Z");

function base(surcharge: Partial<Ligne> = {}, nbEnvoyesAujourdhui = 0) {
  const tables: Record<string, Ligne[]> = {
    envois_programmes: [
      {
        id: "e1",
        user_id: "u",
        prospection_id: "p1",
        prevu_at: "2026-11-03T08:30:00.000Z",
        statut: "programme",
        tentatives: 0,
        erreur: null,
        debut_at: null,
        termine_at: null,
        ...surcharge,
      },
    ],
    reglages: [{ user_id: "u", envois_max_par_jour: 6, envois_ecart_minutes: 10 }],
    prospections: Array.from({ length: nbEnvoyesAujourdhui }, (_, i) => ({
      id: `deja${i}`,
      user_id: "u",
      date_envoi: "2026-11-03",
      statut: "envoyee",
      updated_at: "2026-11-03T07:00:00Z",
    })).concat([{ id: "p1", user_id: "u", date_envoi: null, statut: "valide", updated_at: "x", smtp_message_id: null } as never]),
  };
  return fauxClient(tables);
}

const ligne = (c: { tables: Record<string, Ligne[]> }) => c.tables.envois_programmes[0];

beforeEach(() => envoyerProspection.mockReset());

describe("executerEnvoisDus", () => {
  it("envoie le message dû et marque la programmation comme envoyée", async () => {
    envoyerProspection.mockResolvedValue({ ok: true, prospection: {}, pieceJointe: "CV.pdf" });
    const c = base() as never as { tables: Record<string, Ligne[]> };
    const bilan = await executerEnvoisDus(c as never, "u", MAINTENANT);
    expect(bilan.envoyes).toBe(1);
    expect(ligne(c).statut).toBe("envoye");
    expect(ligne(c).tentatives).toBe(1);
    expect(envoyerProspection).toHaveBeenCalledTimes(1);
  });

  it("ne rien envoyer quand l'heure n'est pas arrivée", async () => {
    const c = base({ prevu_at: "2026-11-03T12:00:00.000Z" }) as never as { tables: Record<string, Ligne[]> };
    expect((await executerEnvoisDus(c as never, "u", MAINTENANT)).envoyes).toBe(0);
    expect(envoyerProspection).not.toHaveBeenCalled();
    expect(ligne(c).statut).toBe("programme");
  });

  it("deux passages simultanés n'envoient le message qu'une seule fois", async () => {
    envoyerProspection.mockResolvedValue({ ok: true, prospection: {}, pieceJointe: null });
    const c = base() as never as { tables: Record<string, Ligne[]> };
    const [a, b] = await Promise.all([executerEnvoisDus(c as never, "u", MAINTENANT), executerEnvoisDus(c as never, "u", MAINTENANT)]);
    expect(a.envoyes + b.envoyes).toBe(1);
    expect(envoyerProspection).toHaveBeenCalledTimes(1);
  });

  it("ne rejoue jamais un message déjà envoyé ou annulé", async () => {
    for (const statut of ["envoye", "annule", "echec", "en_cours"]) {
      envoyerProspection.mockReset();
      const c = base({ statut, debut_at: "2026-11-03T08:55:00.000Z" }) as never as { tables: Record<string, Ligne[]> };
      await executerEnvoisDus(c as never, "u", MAINTENANT);
      expect(envoyerProspection).not.toHaveBeenCalled();
    }
  });

  it("reporte à demain quand la limite du jour est atteinte, sans rien envoyer", async () => {
    const c = base({}, 6) as never as { tables: Record<string, Ligne[]> };
    const bilan = await executerEnvoisDus(c as never, "u", MAINTENANT);
    expect(bilan.envoyes).toBe(0);
    expect(bilan.report).toContain("reporté à demain");
    expect(ligne(c).statut).toBe("programme");
    expect(envoyerProspection).not.toHaveBeenCalled();
  });

  it("retente un échec d'envoi à 30 minutes, puis abandonne au troisième essai", async () => {
    envoyerProspection.mockResolvedValue({ ok: false, code: "smtp", statut: 502, erreur: "L'envoi a échoué : timeout" });
    const c = base() as never as { tables: Record<string, Ligne[]> };
    const bilan = await executerEnvoisDus(c as never, "u", MAINTENANT);
    expect(bilan.retentes).toBe(1);
    expect(ligne(c)).toMatchObject({ statut: "programme", prevu_at: "2026-11-03T09:30:00.000Z", tentatives: 1 });

    const derniere = base({ tentatives: 2 }) as never as { tables: Record<string, Ligne[]> };
    const b2 = await executerEnvoisDus(derniere as never, "u", MAINTENANT);
    expect(b2.echecs).toBe(1);
    expect(ligne(derniere)).toMatchObject({ statut: "echec", tentatives: 3 });
    expect(String(ligne(derniere).erreur)).toContain("timeout");
  });

  it("annule quand le message n'est plus envoyable ou que l'adresse est exclue", async () => {
    envoyerProspection.mockResolvedValue({ ok: false, code: "statut", statut: 409, erreur: "Valide le message" });
    const c = base() as never as { tables: Record<string, Ligne[]> };
    expect((await executerEnvoisDus(c as never, "u", MAINTENANT)).annules).toBe(1);
    expect(ligne(c).statut).toBe("annule");

    envoyerProspection.mockResolvedValue({ ok: false, code: "bloque", statut: 409, erreur: "Envoi refusé : Marie a demandé à ne plus être contactée." });
    const d = base() as never as { tables: Record<string, Ligne[]> };
    await executerEnvoisDus(d as never, "u", MAINTENANT);
    expect(ligne(d).statut).toBe("annule");
    expect(String(ligne(d).erreur)).toContain("ne plus être contactée");
  });

  it("ne réessaie pas tel quel quand le CV ou le destinataire manque", async () => {
    envoyerProspection.mockResolvedValue({ ok: false, code: "cv_manquant", statut: 409, erreur: "Aucun CV en français" });
    const c = base() as never as { tables: Record<string, Ligne[]> };
    expect((await executerEnvoisDus(c as never, "u", MAINTENANT)).echecs).toBe(1);
    expect(ligne(c).statut).toBe("echec");
  });

  it("remet la programmation sans compter d'essai quand la limite est atteinte entre-temps", async () => {
    envoyerProspection.mockResolvedValue({ ok: false, code: "limite", statut: 429, erreur: "Limite de 6 envois par jour atteinte" });
    const c = base() as never as { tables: Record<string, Ligne[]> };
    await executerEnvoisDus(c as never, "u", MAINTENANT);
    expect(ligne(c)).toMatchObject({ statut: "programme", tentatives: 0 });
  });

  it("traite un envoi resté « en cours » : parti s'il a un identifiant, à vérifier sinon", async () => {
    const c = base({ statut: "en_cours", debut_at: "2026-11-03T08:00:00.000Z" }) as never as { tables: Record<string, Ligne[]> };
    c.tables.prospections.find((p) => p.id === "p1")!.smtp_message_id = "<abc@gmail.com>";
    await executerEnvoisDus(c as never, "u", MAINTENANT);
    expect(ligne(c).statut).toBe("envoye");

    const d = base({ statut: "en_cours", debut_at: "2026-11-03T08:00:00.000Z" }) as never as { tables: Record<string, Ligne[]> };
    await executerEnvoisDus(d as never, "u", MAINTENANT);
    expect(ligne(d).statut).toBe("echec");
    expect(String(ligne(d).erreur)).toContain("Envoi interrompu");
  });
});

describe("cloturerProgrammations", () => {
  it("annule la programmation active d'un message avec le motif", async () => {
    const c = base() as never as { tables: Record<string, Ligne[]> };
    await cloturerProgrammations(c as never, "u", "p1", "envoyé manuellement");
    expect(ligne(c)).toMatchObject({ statut: "annule", erreur: "envoyé manuellement" });
  });
});
