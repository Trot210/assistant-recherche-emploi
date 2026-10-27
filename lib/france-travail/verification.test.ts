import { describe, expect, it } from "vitest";
import { fenetreVerification } from "./verification";

const VINGT_MIN = 20 * 60 * 1000;

describe("fenetreVerification", () => {
  it("renvoie une fenêtre vide sans offres", () => {
    expect(fenetreVerification(0, 40, 123456, VINGT_MIN).fin).toBeLessThan(0);
  });

  it("avance d'un lot à chaque créneau de 20 minutes", () => {
    const t0 = 1_000 * VINGT_MIN;
    const a = fenetreVerification(1000, 40, t0, VINGT_MIN);
    const b = fenetreVerification(1000, 40, t0 + VINGT_MIN, VINGT_MIN);
    expect(b.debut).toBe((a.debut + 40) % 1000);
  });

  it("reste stable dans un même créneau", () => {
    const t0 = 5_000 * VINGT_MIN;
    expect(fenetreVerification(1000, 40, t0, VINGT_MIN)).toEqual(
      fenetreVerification(1000, 40, t0 + VINGT_MIN - 1, VINGT_MIN),
    );
  });

  it("ne dépasse jamais la fin de la liste", () => {
    for (let c = 0; c < 200; c++) {
      const f = fenetreVerification(130, 40, c * VINGT_MIN, VINGT_MIN);
      expect(f.debut).toBeGreaterThanOrEqual(0);
      expect(f.fin).toBeLessThanOrEqual(129);
    }
  });

  it("couvre l'ensemble du catalogue au fil des créneaux", () => {
    const total = 1000;
    const vues = new Set<number>();
    for (let c = 0; c < 100; c++) {
      const f = fenetreVerification(total, 40, c * VINGT_MIN, VINGT_MIN);
      for (let i = f.debut; i <= f.fin; i++) vues.add(i);
    }
    expect(vues.size).toBe(total);
  });
});
