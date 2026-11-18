import { describe, expect, it } from "vitest";
import { calculerStatistiques, lundiDeLaSemaine } from "./statistiques";

describe("lundiDeLaSemaine", () => {
  it("renvoie le lundi, y compris un dimanche et un lundi", () => {
    expect(lundiDeLaSemaine("2026-11-18")).toBe("2026-11-16"); // mercredi
    expect(lundiDeLaSemaine("2026-11-22")).toBe("2026-11-16"); // dimanche
    expect(lundiDeLaSemaine("2026-11-16")).toBe("2026-11-16"); // lundi
  });
});

describe("calculerStatistiques", () => {
  const donnees = {
    prospections: [
      { type: "initial", date_envoi: "2026-11-10", reponse_date: "2026-11-13", reponse_type: "interet" },
      { type: "initial", date_envoi: "2026-11-17", reponse_date: null, reponse_type: null },
      { type: "relance", date_envoi: "2026-11-17", reponse_date: null, reponse_type: null },
      { type: "initial", date_envoi: null, reponse_date: null, reponse_type: null },
    ],
    candidatures: [
      { statut: "envoyee", date_envoi: "2026-11-12" },
      { statut: "a_traiter", date_envoi: null },
    ],
    courrier: [
      { nature: "accuse_reception", date_mail: "2026-11-12T08:00:00Z" },
      { nature: "refus", date_mail: "2026-11-17T08:00:00Z" },
      { nature: "entretien", date_mail: "2026-11-18T08:00:00Z" },
      { nature: "autre", date_mail: "2026-11-18T08:00:00Z" },
    ],
  };

  const s = calculerStatistiques(donnees, "2026-11-18", 3);

  it("découpe par semaine, la plus récente en dernier", () => {
    expect(s.semaines.map((x) => x.debut)).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
  });

  it("ne compte pas les relances comme des envois", () => {
    expect(s.semaines[1].envois).toBe(2); // une spontanée le 10, une candidature sur offre le 12
    expect(s.semaines[2].envois).toBe(1); // la spontanée du 17 (la relance ne compte pas)
    expect(s.total.envois).toBe(3);
  });

  it("range accusés, refus et entretiens par semaine", () => {
    expect(s.semaines[1].accuses).toBe(1);
    expect(s.semaines[2].refus).toBe(1);
    expect(s.semaines[2].entretiens).toBe(1);
  });

  it("calcule taux et délai de réponse des spontanées", () => {
    expect(s.spontanees).toEqual({ envoyees: 2, reponses: 1, tauxReponse: 50, delaiMoyenJours: 3 });
  });

  it("renvoie des valeurs nulles sans données", () => {
    const vide = calculerStatistiques({ prospections: [], candidatures: [], courrier: [] }, "2026-11-18");
    expect(vide.spontanees.tauxReponse).toBeNull();
    expect(vide.spontanees.delaiMoyenJours).toBeNull();
    expect(vide.total.envois).toBe(0);
  });
});
