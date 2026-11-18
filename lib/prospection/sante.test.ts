import { describe, expect, it } from "vitest";
import { diagnostiquerSante, resumerErreurs } from "./sante";

const maintenant = new Date("2026-11-18T12:00:00Z");

describe("diagnostiquerSante", () => {
  it("ne dit rien tant qu'aucun passage n'est enregistré", () => {
    expect(diagnostiquerSante({ dernierPassage: null, derniereErreur: null }, maintenant)).toEqual([]);
  });

  it("ne dit rien quand le dernier passage est récent et sans erreur", () => {
    expect(diagnostiquerSante({ dernierPassage: "2026-11-18T11:55:00Z", derniereErreur: null }, maintenant)).toEqual([]);
  });

  it("signale un tri qui ne tourne plus", () => {
    const alertes = diagnostiquerSante({ dernierPassage: "2026-11-18T08:00:00Z", derniereErreur: null }, maintenant);
    expect(alertes).toHaveLength(1);
    expect(alertes[0]).toContain("4 heures");
  });

  it("signale l'erreur du dernier passage", () => {
    const alertes = diagnostiquerSante({ dernierPassage: "2026-11-18T11:55:00Z", derniereErreur: "Connexion refusée" }, maintenant);
    expect(alertes).toEqual(["Le dernier passage du tri des mails a rencontré un problème : Connexion refusée"]);
  });

  it("ignore une date illisible", () => {
    expect(diagnostiquerSante({ dernierPassage: "n'importe quoi", derniereErreur: null }, maintenant)).toEqual([]);
  });
});

describe("resumerErreurs", () => {
  it("renvoie null sans erreur et joint les erreurs sinon", () => {
    expect(resumerErreurs([])).toBeNull();
    expect(resumerErreurs(["  "])).toBeNull();
    expect(resumerErreurs(["a", "b"])).toBe("a ; b");
  });

  it("borne la longueur", () => {
    expect(resumerErreurs(["x".repeat(500)])?.length).toBe(300);
  });
});
