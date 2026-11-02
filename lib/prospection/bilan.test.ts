import { describe, expect, it } from "vitest";
import { bilanProspection, calculerEntonnoir, SEUIL_COMPARAISON } from "./bilan";

type M = Parameters<typeof calculerEntonnoir>[0][number];

function msg(surcharge: Partial<M> = {}): M {
  return {
    type: "initial",
    statut: "envoyee",
    contact_id: "c1",
    entreprise_id: "e1",
    date_envoi: "2026-11-02",
    reponse_type: null,
    reponse_date: null,
    langue: "fr",
    poste_vise: "Category Manager",
    ...surcharge,
  };
}

describe("calculerEntonnoir", () => {
  const messages = [
    msg(),
    msg({ statut: "reponse_recue", reponse_type: "refus", reponse_date: "2026-11-05" }),
    msg({ statut: "reponse_recue", reponse_type: "entretien", reponse_date: "2026-11-09" }),
    msg({ statut: "reponse_recue", reponse_type: null, reponse_date: "2026-11-04" }),
    msg({ statut: "sans_suite", reponse_type: "non_distribue" }),
    msg({ type: "relance", date_envoi: "2026-11-09", statut: "envoyee" }),
    msg({ statut: "a_valider", date_envoi: null }),
  ];
  const e = calculerEntonnoir(messages);

  it("compte envoyés, rebonds et remis (hors brouillons et relances)", () => {
    expect(e.envoyes).toBe(5);
    expect(e.rebonds).toBe(1);
    expect(e.remis).toBe(4);
    expect(e.relancesEnvoyees).toBe(1);
  });

  it("sépare les réponses positives, négatives et sans type", () => {
    expect(e.reponses).toBe(3);
    expect(e.positives).toBe(1);
    expect(e.entretiens).toBe(1);
    expect(e.negatives).toBe(1);
    expect(e.autres).toBe(1);
  });

  it("calcule les taux sur la bonne base et le délai moyen", () => {
    expect(e.tauxRebond).toBeCloseTo(0.2);
    expect(e.tauxReponse).toBeCloseTo(0.75);
    expect(e.tauxPositif).toBeCloseTo(0.25);
    expect(e.delaiMoyenJours).toBe(4);
  });

  it("renvoie des taux nuls sans message", () => {
    const vide = calculerEntonnoir([]);
    expect(vide.envoyes).toBe(0);
    expect(vide.tauxRebond).toBeNull();
    expect(vide.tauxReponse).toBeNull();
    expect(vide.delaiMoyenJours).toBeNull();
  });
});

describe("bilanProspection", () => {
  const contacts = [
    { id: "c1", poste: "Marketing Director", generique: false, email_verification: null },
    { id: "c2", poste: "HR Director", generique: false, email_verification: null },
  ];
  const entreprises = [{ id: "e1", secteur: "Agroalimentaire" }];

  it("ne compare pas les segments avant le seuil", () => {
    const b = bilanProspection({ prospections: [msg(), msg()], contacts, entreprises });
    expect(b.segments).toBeNull();
    expect(b.progressionSeuil).toEqual({ envoyes: 2, seuil: SEUIL_COMPARAISON });
  });

  it("compare par rôle, secteur, langue et poste une fois le seuil atteint", () => {
    const prospections = [
      ...Array.from({ length: 20 }, () => msg({ contact_id: "c1" })),
      ...Array.from({ length: 6 }, () => msg({ contact_id: "c1", statut: "reponse_recue", reponse_type: "entretien", reponse_date: "2026-11-05" })),
      ...Array.from({ length: 6 }, () => msg({ contact_id: "c2", langue: "en" })),
    ];
    const b = bilanProspection({ prospections, contacts, entreprises });
    expect(b.segments).not.toBeNull();
    const decideur = b.segments!.role.find((s) => s.cle === "decideur")!;
    expect(decideur.remis).toBe(26);
    expect(decideur.positives).toBe(6);
    expect(decideur.fiable).toBe(true);
    expect(b.segments!.role[0].cle).toBe("decideur");
    expect(b.segments!.langue.map((s) => s.libelle)).toEqual(expect.arrayContaining(["Français", "Anglais"]));
    expect(b.segments!.secteur[0].libelle).toBe("Agroalimentaire");
  });

  it("signale un segment trop petit pour être lu", () => {
    const prospections = [...Array.from({ length: 28 }, () => msg()), ...Array.from({ length: 2 }, () => msg({ langue: "en" }))];
    const b = bilanProspection({ prospections, contacts, entreprises });
    expect(b.segments!.langue.find((s) => s.cle === "en")!.fiable).toBe(false);
  });
});
