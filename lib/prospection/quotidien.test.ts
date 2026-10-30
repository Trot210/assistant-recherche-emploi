import { describe, expect, it } from "vitest";
import { relancesAPreparer } from "@/lib/prospection/quotidien";
import { construireRecap, type DonneesRecap } from "@/lib/prospection/recap";

const p = (id: string, surcharge: Record<string, unknown> = {}) => ({
  id,
  type: "initial" as const,
  statut: "envoyee" as const,
  prochaine_relance: "2026-11-05",
  nb_relances: 0,
  parent_id: null as string | null,
  ...surcharge,
});

describe("relancesAPreparer", () => {
  it("retient les relances dues, les plus anciennes d'abord, dans la limite du jour", () => {
    const liste = [
      p("a", { prochaine_relance: "2026-11-05" }),
      p("b", { prochaine_relance: "2026-11-02" }),
      p("c", { prochaine_relance: "2026-11-04" }),
      p("d", { prochaine_relance: "2026-11-03" }),
    ];
    expect(relancesAPreparer(liste, "2026-11-06")).toEqual(["b", "d", "c"]);
    expect(relancesAPreparer(liste, "2026-11-06", 1)).toEqual(["b"]);
  });

  it("ignore ce qui n'est pas dû, déjà répondu, au maximum de relances ou déjà en préparation", () => {
    const liste = [
      p("futur", { prochaine_relance: "2026-12-01" }),
      p("reponse", { statut: "reponse_recue" }),
      p("max", { nb_relances: 2 }),
      p("enprep"),
      p("brouillon", { type: "relance", statut: "a_valider", parent_id: "enprep", prochaine_relance: null }),
      p("ok"),
    ];
    expect(relancesAPreparer(liste, "2026-11-06")).toEqual(["ok"]);
  });
});

const donnees = (surcharge: Partial<DonneesRecap> = {}): DonneesRecap => ({
  aujourdhui: "2026-11-06",
  urlSite: "https://exemple.vercel.app",
  aValider: [],
  relancesPreparees: [],
  relancesRestantes: [],
  nouvellesReponses: 0,
  actionsDuJour: [],
  nouvellesOffres: 0,
  prioritaires: [],
  coutMoisUsd: 0.4,
  plafondUsd: 3,
  hunterVerificationsRestantes: 60,
  plafondAtteint: false,
  ...surcharge,
});

describe("construireRecap", () => {
  it("ne dit rien quand il n'y a rien à faire, même avec des offres ou des priorités", () => {
    expect(construireRecap(donnees())).toBeNull();
    expect(construireRecap(donnees({ nouvellesOffres: 12, prioritaires: [{ nom: "Bel", score: 80, resume: "x" }] }))).toBeNull();
  });

  it("compte les choses à faire dans le sujet et liste chaque bloc", () => {
    const r = construireRecap(
      donnees({
        aValider: [
          { entreprise: "Monoprix", poste: "Category Manager", relance: false },
          { entreprise: "Bel", poste: "Chef de Produit", relance: true },
        ],
        relancesPreparees: [{ entreprise: "Bel", poste: "Chef de Produit" }],
        nouvellesReponses: 2,
        actionsDuJour: [{ entreprise: "Danone", action: "Postuler site carrières", date: "2026-11-06" }],
        nouvellesOffres: 1,
        prioritaires: [{ nom: "Campari", score: 72, resume: "secteur cible, contact vérifié" }],
      }),
    )!;
    // 2 messages + 1 bloc réponses + 1 action
    expect(r.nbActions).toBe(4);
    expect(r.sujet).toBe("Le Rayon — 4 choses à faire aujourd'hui");
    expect(r.texte).toContain("MESSAGES À VALIDER (2)");
    expect(r.texte).toContain("- Bel — Chef de Produit (relance)");
    expect(r.texte).toContain("RELANCES PRÉPARÉES CE MATIN (1)");
    expect(r.texte).toContain("2 nouveaux messages");
    expect(r.texte).toContain("Postuler site carrières (pour le 06/11/2026)");
    expect(r.texte).toContain("1 nouvelle offre sur tes postes ciblés");
    expect(r.texte).toContain("Campari (priorité 72/100)");
    expect(r.texte).toContain("https://exemple.vercel.app/aujourdhui");
    expect(r.texte).toContain("Hunter : 60 vérification(s)");
  });

  it("signale les relances qui n'ont pas pu être préparées et le plafond atteint", () => {
    const r = construireRecap(
      donnees({
        relancesRestantes: [{ entreprise: "Aldi", poste: "Acheteur", raison: "plafond Claude atteint" }],
        plafondAtteint: true,
        coutMoisUsd: 3.02,
      }),
    )!;
    expect(r.sujet).toBe("Le Rayon — 1 chose à faire aujourd'hui");
    expect(r.texte).toContain("RELANCES DUES NON PRÉPARÉES (1)");
    expect(r.texte).toContain("(plafond atteint)");
  });

  it("signale une lecture de la boîte mail impossible sans la compter comme une réponse", () => {
    const r = construireRecap(donnees({ reponsesIndisponibles: true, aValider: [{ entreprise: "Bel", poste: "Chef de Produit", relance: false }] }))!;
    expect(r.texte).toContain("La lecture de ta boîte mail n'a pas abouti");
    expect(r.texte).not.toContain("RÉPONSES");
  });
});
