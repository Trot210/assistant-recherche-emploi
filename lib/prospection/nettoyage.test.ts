import { describe, expect, it } from "vitest";
import { actionDeNettoyage, dateLimiteNettoyage, JOURS_AVANT_NETTOYAGE } from "./nettoyage";

describe("dateLimiteNettoyage", () => {
  it("recule de 30 jours", () => {
    const limite = dateLimiteNettoyage(new Date("2026-12-03T10:00:00Z"), JOURS_AVANT_NETTOYAGE);
    expect(limite.toISOString()).toBe("2026-11-03T10:00:00.000Z");
  });
});

describe("actionDeNettoyage", () => {
  const prospection = new Set(["rep-societe@x"]);

  it("retire seulement du dossier un mail aussi rangé dans « Prospection »", () => {
    expect(actionDeNettoyage("rep-societe@x", prospection)).toBe("retirer");
  });

  it("met les autres à la corbeille, y compris sans identifiant lisible", () => {
    expect(actionDeNettoyage("accuse-1@x", prospection)).toBe("corbeille");
    expect(actionDeNettoyage(null, prospection)).toBe("corbeille");
  });
});
