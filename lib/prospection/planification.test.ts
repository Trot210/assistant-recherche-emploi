import { describe, expect, it } from "vitest";
import {
  apresEchecEnvoi,
  choisirEnvoisDus,
  decomposerParis,
  etalerEnvois,
  formaterProgrammation,
  instantVersLocal,
  localVersInstant,
  parisVersUtc,
  validerProgrammation,
} from "@/lib/prospection/planification";

describe("heure de Paris", () => {
  it("convertit l'heure de Paris en UTC, été comme hiver", () => {
    // Hiver (UTC+1) et été (UTC+2)
    expect(parisVersUtc("2026-11-06", "09:30").toISOString()).toBe("2026-11-06T08:30:00.000Z");
    expect(parisVersUtc("2026-07-14", "09:30").toISOString()).toBe("2026-07-14T07:30:00.000Z");
  });

  it("reste juste le jour du changement d'heure", () => {
    // Fin de l'heure d'été : dimanche 25 octobre 2026 ; Paris passe de UTC+2 à UTC+1.
    expect(parisVersUtc("2026-10-25", "12:00").toISOString()).toBe("2026-10-25T11:00:00.000Z");
    expect(parisVersUtc("2026-10-24", "12:00").toISOString()).toBe("2026-10-24T10:00:00.000Z");
  });

  it("relit la date, l'heure et le jour de la semaine à Paris", () => {
    expect(decomposerParis(new Date("2026-11-06T08:30:00Z"))).toEqual({ date: "2026-11-06", heure: "09:30", jourSemaine: 5 });
    // 23 h 30 UTC l'hiver = 0 h 30 le lendemain à Paris
    expect(decomposerParis(new Date("2026-11-06T23:30:00Z")).date).toBe("2026-11-07");
  });

  it("écrit la date en français avec l'heure de Paris", () => {
    expect(formaterProgrammation(new Date("2026-11-06T08:30:00Z"))).toBe("vendredi 6 novembre 2026 à 9 h 30 (heure de Paris)");
    expect(formaterProgrammation(new Date("2026-11-06T08:00:00Z"))).toBe("vendredi 6 novembre 2026 à 9 h (heure de Paris)");
  });
});

describe("validerProgrammation", () => {
  const maintenant = new Date("2026-11-02T10:00:00Z");

  it("refuse le passé immédiat, une date invalide et un horizon trop lointain", () => {
    expect(validerProgrammation(new Date("2026-11-02T10:01:00Z"), maintenant).erreur).toContain("deux minutes");
    expect(validerProgrammation(new Date("pas une date"), maintenant).erreur).toContain("invalides");
    expect(validerProgrammation(new Date("2027-12-01T10:00:00Z"), maintenant).erreur).toContain("120");
  });

  it("accepte un créneau de bureau sans avertissement", () => {
    const r = validerProgrammation(parisVersUtc("2026-11-03", "10:00"), maintenant);
    expect(r.erreur).toBeUndefined();
    expect(r.avertissements).toEqual([]);
  });

  it("prévient pour un week-end ou une heure hors bureau, sans interdire", () => {
    expect(validerProgrammation(parisVersUtc("2026-11-07", "10:00"), maintenant).avertissements[0]).toContain("week-end");
    const tard = validerProgrammation(parisVersUtc("2026-11-03", "21:00"), maintenant);
    expect(tard.erreur).toBeUndefined();
    expect(tard.avertissements[0]).toContain("hors des heures de bureau");
  });
});

describe("choisirEnvoisDus", () => {
  const base = {
    maintenant: new Date("2026-11-03T09:00:00Z"),
    dernierEnvoi: null as Date | null,
    nbEnvoyesAujourdhui: 0,
    maxParJour: 6,
    ecartMinutes: 10,
  };
  const programmes = [
    { id: "b", prevu_at: "2026-11-03T08:50:00Z" },
    { id: "a", prevu_at: "2026-11-03T08:30:00Z" },
    { id: "futur", prevu_at: "2026-11-03T12:00:00Z" },
  ];

  it("envoie le plus ancien envoi dû, un seul par passage, et laisse les autres pour la suite", () => {
    const d = choisirEnvoisDus({ ...base, programmes });
    expect(d.aEnvoyer).toEqual(["a"]);
    expect(d.raison).toContain("passages suivants");
  });

  it("n'envoie rien quand rien n'est dû", () => {
    expect(choisirEnvoisDus({ ...base, programmes: [programmes[2]] })).toEqual({ aEnvoyer: [], raison: null });
  });

  it("respecte la limite du jour, envois manuels compris", () => {
    const d = choisirEnvoisDus({ ...base, programmes, nbEnvoyesAujourdhui: 6 });
    expect(d.aEnvoyer).toEqual([]);
    expect(d.raison).toContain("reporté à demain");
  });

  it("respecte l'écart minimal avec le dernier envoi", () => {
    expect(choisirEnvoisDus({ ...base, programmes, dernierEnvoi: new Date("2026-11-03T08:55:00Z") }).aEnvoyer).toEqual([]);
    expect(choisirEnvoisDus({ ...base, programmes, dernierEnvoi: new Date("2026-11-03T08:49:00Z") }).aEnvoyer).toEqual(["a"]);
  });
});

describe("apresEchecEnvoi", () => {
  const maintenant = new Date("2026-11-03T09:00:00Z");

  it("retente deux fois à 30 minutes d'écart, puis abandonne", () => {
    expect(apresEchecEnvoi(1, maintenant)).toEqual({ rejouer: true, prochainEssai: new Date("2026-11-03T09:30:00Z") });
    expect(apresEchecEnvoi(2, maintenant).rejouer).toBe(true);
    expect(apresEchecEnvoi(3, maintenant)).toEqual({ rejouer: false, prochainEssai: null });
  });
});

describe("etalerEnvois", () => {
  // Hasard fixe pour des résultats reproductibles
  const hasard = () => 0.5;

  it("répartit 10 envois sur des jours ouvrés, 3 par jour au plus, dans la fenêtre 9 h–17 h", () => {
    const c = etalerEnvois({ nombre: 10, debut: "2026-11-03", maxParJour: 3, ecartMinutes: 10, hasard });
    expect(c).toHaveLength(10);
    const parJour = new Map<string, number>();
    for (const x of c) parJour.set(x.jour, (parJour.get(x.jour) ?? 0) + 1);
    expect([...parJour.values()]).toEqual([3, 3, 3, 1]);
    for (const x of c) {
      const [h] = x.heure.split(":").map(Number);
      expect(h).toBeGreaterThanOrEqual(9);
      expect(h).toBeLessThan(17);
    }
    expect(c.map((x) => x.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("saute les week-ends", () => {
    // Vendredi 6 novembre 2026 : le 7 et le 8 sont ignorés
    const c = etalerEnvois({ nombre: 4, debut: "2026-11-06", maxParJour: 2, ecartMinutes: 10, hasard });
    expect(c.map((x) => x.jour)).toEqual(["2026-11-06", "2026-11-06", "2026-11-09", "2026-11-09"]);
  });

  it("espace les envois d'une même journée et varie les horaires avec le hasard", () => {
    const c = etalerEnvois({ nombre: 3, debut: "2026-11-03", maxParJour: 3, ecartMinutes: 10 });
    const minutes = c.map((x) => Number(x.heure.slice(0, 2)) * 60 + Number(x.heure.slice(3)));
    expect(minutes[1] - minutes[0]).toBeGreaterThanOrEqual(30);
    expect(minutes[2] - minutes[1]).toBeGreaterThanOrEqual(30);
    expect(minutes.every((m) => m % 5 === 0)).toBe(true);
  });

  it("évite les horaires déjà pris à l'écart minimal près", () => {
    const sansOccupes = etalerEnvois({ nombre: 1, debut: "2026-11-03", maxParJour: 3, ecartMinutes: 10, hasard });
    const avec = etalerEnvois({ nombre: 1, debut: "2026-11-03", maxParJour: 3, ecartMinutes: 10, hasard, occupes: [sansOccupes[0].instant] });
    expect(Math.abs(avec[0].instant.getTime() - sansOccupes[0].instant.getTime())).toBeGreaterThanOrEqual(10 * 60_000);
  });
});

describe("champ date et heure du navigateur", () => {
  it("lit la saisie comme une heure de Paris et la restitue à l'identique", () => {
    const instant = localVersInstant("2026-11-06T09:30")!;
    expect(instant.toISOString()).toBe("2026-11-06T08:30:00.000Z");
    expect(instantVersLocal(instant)).toBe("2026-11-06T09:30");
  });

  it("refuse une saisie vide ou mal formée", () => {
    expect(localVersInstant("")).toBeNull();
    expect(localVersInstant("06/11/2026 09:30")).toBeNull();
  });
});
