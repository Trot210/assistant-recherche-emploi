import { describe, expect, it } from "vitest";
import { construireRecap, type DonneesRecap } from "./recap";

function base(extra: Partial<DonneesRecap> = {}): DonneesRecap {
  return {
    aujourdhui: "2026-11-18",
    urlSite: "https://exemple.example",
    aValider: [],
    relancesPreparees: [],
    relancesRestantes: [],
    nouvellesReponses: 0,
    actionsDuJour: [],
    nouvellesOffres: 0,
    prioritaires: [],
    coutMoisUsd: null,
    plafondUsd: null,
    hunterVerificationsRestantes: null,
    plafondAtteint: false,
    ...extra,
  };
}

describe("construireRecap : panne et relances de candidatures", () => {
  it("n'envoie rien quand il n'y a rien à dire", () => {
    expect(construireRecap(base())).toBeNull();
  });

  it("signale une panne de l'automatisation, en premier", () => {
    const r = construireRecap(base({ alertesSysteme: ["Le tri automatique des mails ne s'est pas exécuté depuis 4 heures."], nouvellesReponses: 2 }));
    expect(r).not.toBeNull();
    expect(r!.nbActions).toBe(2);
    expect(r!.texte.indexOf("ATTENTION")).toBeGreaterThan(-1);
    expect(r!.texte.indexOf("ATTENTION")).toBeLessThan(r!.texte.indexOf("RÉPONSES"));
  });

  it("propose les candidatures sans nouvelles, comptées comme une seule action", () => {
    const r = construireRecap(
      base({
        candidaturesARelancer: [
          { entreprise: "Société A", poste: "Poste A", jours: 12 },
          { entreprise: "Société B", poste: "Poste B", jours: 20 },
        ],
      }),
    );
    expect(r!.nbActions).toBe(1);
    expect(r!.texte).toContain("CANDIDATURES SANS NOUVELLES (2)");
    expect(r!.texte).toContain("Société A — Poste A (envoyée il y a 12 jours)");
  });
});
