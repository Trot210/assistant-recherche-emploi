import { describe, expect, it } from "vitest";
import {
  analyserEcarts,
  bucketLocalisation,
  detecterDoublons,
  moyenneParGroupe,
  preTrierParMotsCles,
} from "./insights-utils";

describe("analyserEcarts", () => {
  it("classe les écarts par thème via des mots-clés", () => {
    const resultat = analyserEcarts([
      ["Niveau d'anglais insuffisant pour le poste"],
      ["Anglais courant exigé, candidat B2"],
      ["Manque d'expérience en management d'équipe"],
      ["Pas de diplôme d'ingénieur requis par l'offre"],
    ]);
    const parTheme = Object.fromEntries(resultat.map((t) => [t.theme, t.count]));
    expect(parTheme["Langue"]).toBe(2);
    expect(parTheme["Management / encadrement"]).toBe(1);
    expect(parTheme["Formation / diplôme"]).toBe(1);
  });

  it("un écart peut compter dans plusieurs thèmes à la fois", () => {
    const resultat = analyserEcarts([["Anglais courant requis en environnement de management"]]);
    const parTheme = Object.fromEntries(resultat.map((t) => [t.theme, t.count]));
    expect(parTheme["Langue"]).toBe(1);
    expect(parTheme["Management / encadrement"]).toBe(1);
  });

  it("tableau vide sans écarts", () => {
    expect(analyserEcarts([])).toEqual([]);
    expect(analyserEcarts([[]])).toEqual([]);
  });

  it("trie par fréquence décroissante", () => {
    const resultat = analyserEcarts([
      ["Anglais requis"],
      ["Anglais courant"],
      ["Diplôme manquant"],
    ]);
    expect(resultat[0].theme).toBe("Langue");
    expect(resultat[0].count).toBe(2);
  });
});

describe("moyenneParGroupe", () => {
  it("calcule la moyenne et le total par groupe", () => {
    const resultat = moyenneParGroupe([
      { groupe: "france_travail", score: 80 },
      { groupe: "france_travail", score: 60 },
      { groupe: "apec", score: 90 },
    ]);
    expect(resultat).toEqual([
      { groupe: "apec", moyenne: 90, total: 1 },
      { groupe: "france_travail", moyenne: 70, total: 2 },
    ]);
  });

  it("tableau vide", () => {
    expect(moyenneParGroupe([])).toEqual([]);
  });
});

describe("bucketLocalisation", () => {
  it("regroupe Paris intra-muros vs IDF hors Paris vs non précisée", () => {
    expect(bucketLocalisation("Paris 15e")).toBe("Paris intra-muros");
    expect(bucketLocalisation("92 - Boulogne-Billancourt")).toBe("IDF hors Paris");
    expect(bucketLocalisation(null)).toBe("Non précisée");
  });
});

describe("detecterDoublons", () => {
  it("regroupe les offres au titre/entreprise/localisation identiques après normalisation", () => {
    const resultat = detecterDoublons([
      { id: "1", titre: "Category Manager (H/F)", entreprise: "Aldi", localisation: "75 - Paris" },
      { id: "2", titre: "Category Manager H/F", entreprise: "ALDI", localisation: "75 - Paris" },
      { id: "3", titre: "Acheteur (F/H)", entreprise: "Lidl", localisation: "75 - Paris" },
    ]);
    expect(resultat).toHaveLength(1);
    expect(resultat[0].count).toBe(2);
    expect(resultat[0].ids.sort()).toEqual(["1", "2"]);
  });

  it("ignore les offres sans entreprise renseignée", () => {
    const resultat = detecterDoublons([
      { id: "1", titre: "Category Manager", entreprise: null, localisation: "75 - Paris" },
      { id: "2", titre: "Category Manager", entreprise: null, localisation: "75 - Paris" },
    ]);
    expect(resultat).toEqual([]);
  });

  it("ne confond pas des offres au même intitulé/entreprise mais publiées dans des villes différentes (agences d'intérim)", () => {
    const resultat = detecterDoublons([
      { id: "1", titre: "Conseiller clientèle (H/F)", entreprise: "Leihia", localisation: "95 - Boissy" },
      { id: "2", titre: "Conseiller clientèle (H/F)", entreprise: "Leihia", localisation: "92 - Fontenay" },
      { id: "3", titre: "Conseiller clientèle (H/F)", entreprise: "Leihia", localisation: "95 - Boissy" },
    ]);
    expect(resultat).toHaveLength(1);
    expect(resultat[0].count).toBe(2);
    expect(resultat[0].ids.sort()).toEqual(["1", "3"]);
  });

  it("aucun doublon quand tout est distinct", () => {
    const resultat = detecterDoublons([
      { id: "1", titre: "Category Manager", entreprise: "Aldi", localisation: "75 - Paris" },
      { id: "2", titre: "Acheteur", entreprise: "Lidl", localisation: "75 - Paris" },
    ]);
    expect(resultat).toEqual([]);
  });
});

describe("preTrierParMotsCles", () => {
  const intitulesCibles = ["Category Manager", "Acheteur"];

  it("classe les offres non notées par chevauchement avec les intitulés ciblés", () => {
    const resultat = preTrierParMotsCles(
      [
        { id: "1", titre: "Category Manager Gaming H/F" },
        { id: "2", titre: "Acheteur Textile (H/F)" },
        { id: "3", titre: "Réceptionniste hôtel" },
      ],
      intitulesCibles,
    );
    const ids = resultat.map((r) => r.id);
    expect(ids).toContain("1");
    expect(ids).toContain("2");
    expect(ids).not.toContain("3");
  });

  it("trie par score heuristique décroissant", () => {
    const resultat = preTrierParMotsCles(
      [
        { id: "1", titre: "Category Manager" },
        { id: "2", titre: "Manager d'équipe" },
      ],
      intitulesCibles,
    );
    expect(resultat[0].id).toBe("1");
    expect(resultat[0].scoreHeuristique).toBeGreaterThan(resultat[1]?.scoreHeuristique ?? 0);
  });

  it("liste vide sans intitulés ciblés ou sans offres", () => {
    expect(preTrierParMotsCles([], intitulesCibles)).toEqual([]);
    expect(preTrierParMotsCles([{ id: "1", titre: "Category Manager" }], [])).toEqual([]);
  });
});
