import { describe, expect, it } from "vitest";
import {
  dedoublonnerOffres,
  lienOffreFranceTravail,
  liensPersonnes,
  liensRecherche,
  marqueEntreprise,
  memeEntreprise,
  motsDistinctifs,
  offrePertinente,
  selectionnerOffres,
  type OffreTrouvee,
} from "@/lib/prospection/offres";

const offre = (surcharge: Partial<OffreTrouvee> = {}): OffreTrouvee => ({
  titre: "Category Manager H/F",
  employeur: "OPELLA HEALTHCARE FRANCE",
  lieu: "Neuilly-sur-Seine",
  date: "2026-10-20",
  lien: "https://candidat.francetravail.fr/offres/recherche/detail/1",
  source: "base",
  offreId: null,
  ...surcharge,
});

describe("noms d'entreprise", () => {
  it("garde les mots distinctifs, sans forme juridique ni parenthèses", () => {
    expect(motsDistinctifs("BEL (LA VACHE QUI RIT - FBSA) (F.B.S.A)")).toEqual(["bel"]);
    expect(motsDistinctifs("OPELLA HEALTHCARE FRANCE SAS")).toEqual(["opella", "healthcare"]);
    expect(marqueEntreprise("MONOPRIX EXPLOITATION, PAR ABREVIATION MPX")).toBe("monoprix");
    expect(marqueEntreprise("SHOWROOMPRIVE.COM")).toBe("showroomprive");
  });

  it("reconnaît le même employeur sur le nom de marque, comme mot entier", () => {
    expect(memeEntreprise("OPELLA HEALTHCARE FRANCE SAS", "Opella")).toBe(true);
    expect(memeEntreprise("BEL (LA VACHE QUI RIT - FBSA)", "Fromageries Bel")).toBe(true);
    expect(memeEntreprise("BEL (LA VACHE QUI RIT - FBSA)", "Isabelle Conseil")).toBe(false);
    expect(memeEntreprise("OPELLA HEALTHCARE FRANCE SAS", null)).toBe(false);
  });
});

describe("offrePertinente", () => {
  it("retient les intitulés des métiers visés et écarte les métiers hors cible", () => {
    expect(offrePertinente("Category Manager H/F")).toBe(true);
    expect(offrePertinente("Chef de produit junior")).toBe(true);
    expect(offrePertinente("Acheteur(se) packaging")).toBe(true);
    expect(offrePertinente("Responsable grands comptes GMS")).toBe(true);
    expect(offrePertinente("Vendeur en magasin")).toBe(false);
    expect(offrePertinente("Conseiller bancaire")).toBe(false);
    expect(offrePertinente("Cariste")).toBe(false);
  });
});

describe("selectionnerOffres", () => {
  it("garde les offres pertinentes de l'entreprise, les plus récentes d'abord, sans doublon", () => {
    const liste = [
      offre({ titre: "Trade Marketing Manager", date: "2026-10-01", lien: "a" }),
      offre({ titre: "Category Manager H/F", date: "2026-10-25", lien: "b" }),
      offre({ titre: "Category Manager H/F", date: "2026-10-25", lien: "b", source: "france_travail" }),
      offre({ titre: "Vendeur", lien: "c" }),
      offre({ titre: "Category Manager", employeur: "Autre Société", lien: "d" }),
    ];
    const retenues = selectionnerOffres("OPELLA HEALTHCARE FRANCE SAS", liste);
    expect(retenues.map((o) => o.lien)).toEqual(["b", "a"]);
  });

  it("dédoublonne sur le titre et l'employeur quand il n'y a pas de lien", () => {
    const memeTitre = [offre({ lien: null }), offre({ lien: null, titre: "category manager h/f" })];
    expect(dedoublonnerOffres(memeTitre)).toHaveLength(1);
    expect(dedoublonnerOffres([offre({ lien: null }), offre({ lien: null, titre: "Trade Marketing" })])).toHaveLength(2);
  });
});

describe("liens", () => {
  it("prépare des recherches avec la marque et le poste, encodés", () => {
    const liens = liensRecherche("OPELLA HEALTHCARE FRANCE SAS", "Category Manager", "https://www.opella.com/fr");
    expect(liens.map((l) => l.libelle)).toEqual(["LinkedIn", "Welcome to the Jungle", "Indeed", "Site carrières (recherche Google)"]);
    expect(liens[0].url).toBe("https://www.linkedin.com/jobs/search/?keywords=opella%20Category%20Manager");
    expect(liens[3].url).toContain("site%3Awww.opella.com");
  });

  it("n'ajoute pas de recherche carrières sans site", () => {
    expect(liensRecherche("Bel", "Chef de Produit", null)).toHaveLength(3);
  });

  it("construit le lien public d'une offre France Travail", () => {
    expect(lienOffreFranceTravail("123ABC")).toBe("https://candidat.francetravail.fr/offres/recherche/detail/123ABC");
  });
});

describe("liensPersonnes", () => {
  it("prépare des recherches de personnes avec la marque", () => {
    const liens = liensPersonnes("OPELLA HEALTHCARE FRANCE SAS");
    expect(liens).toHaveLength(3);
    expect(liens[0].url).toBe("https://www.linkedin.com/search/results/people/?keywords=opella%20category%20manager");
  });
});
