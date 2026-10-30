import { describe, expect, it } from "vitest";
import { calculerPriorite, resumerPriorite, type EntreeScore } from "@/lib/prospection/priorite";

const base = (e: Partial<EntreeScore["entreprise"]> = {}): EntreeScore["entreprise"] => ({
  statut: "a_analyser",
  secteur: "Agroalimentaire",
  tranche_effectif: "42",
  departement: "92",
  politique_candidature: null,
  offre_reperee_url: null,
  offre_reperee_titre: null,
  contact_interne: null,
  ...e,
});

const contact = (c: Partial<EntreeScore["contacts"][number]> = {}): EntreeScore["contacts"][number] => ({
  email: "marie.dupont@exemple.fr",
  generique: false,
  poste: "Head of Trade Marketing",
  email_statut: "ok",
  email_verification: "valide",
  ...c,
});

describe("calculerPriorite", () => {
  it("note au maximum une grande entreprise du secteur cible, proche, avec un contact vérifié du bon métier", () => {
    const p = calculerPriorite({ entreprise: base(), contacts: [contact()], nbMessages: 0 });
    // 25 secteur + 20 taille + 15 proximité + 12 + 10 + 8 contact
    expect(p.score).toBe(90);
    expect(p.raisons).toEqual(
      expect.arrayContaining(["secteur cible", "grande structure", "contact nominatif", "adresse vérifiée", "contact du bon métier"]),
    );
    expect(p.freins).toEqual([]);
  });

  it("ajoute 10 points pour un contact interne et ne dépasse jamais 100", () => {
    const p = calculerPriorite({ entreprise: base({ contact_interne: "Julie, ancienne collègue" }), contacts: [contact()], nbMessages: 0 });
    expect(p.score).toBe(100);
    expect(p.raisons).toContain("contact interne");
  });

  it("pénalise une entreprise sans contact joignable ou avec une simple adresse générique", () => {
    const sans = calculerPriorite({ entreprise: base(), contacts: [], nbMessages: 0 });
    expect(sans.score).toBe(60);
    expect(sans.freins).toContain("aucun contact joignable");
    const generique = calculerPriorite({ entreprise: base(), contacts: [contact({ generique: true })], nbMessages: 0 });
    expect(generique.score).toBe(64);
    expect(generique.freins).toContain("seulement une adresse générique");
  });

  it("ne compte pas une adresse invalide ou exclue comme joignable", () => {
    const p = calculerPriorite({
      entreprise: base(),
      contacts: [contact({ email_statut: "invalide" }), contact({ email_verification: "invalide" }), contact({ email_statut: "ne_plus_contacter" })],
      nbMessages: 0,
    });
    expect(p.freins).toContain("aucun contact joignable");
  });

  it("retire des points pour une offre publiée, une politique défavorable et un message déjà envoyé", () => {
    const entree = { contacts: [contact()] };
    const offre = calculerPriorite({ ...entree, entreprise: base({ offre_reperee_url: "https://exemple.fr/o" }), nbMessages: 0 });
    expect(offre.score).toBe(65);
    const politique = calculerPriorite({ ...entree, entreprise: base({ politique_candidature: "non_conservees" }), nbMessages: 0 });
    expect(politique.score).toBe(50);
    const deja = calculerPriorite({ ...entree, entreprise: base(), nbMessages: 2 });
    expect(deja.score).toBe(40);
    expect(deja.freins).toContain("déjà contactée");
  });

  it("ne descend jamais sous 0", () => {
    const p = calculerPriorite({
      entreprise: base({ secteur: null, tranche_effectif: "00", departement: "77", politique_candidature: "portail_uniquement", offre_reperee_titre: "x" }),
      contacts: [],
      nbMessages: 1,
    });
    expect(p.score).toBe(0);
  });

  it("exclut une entreprise écartée ou marquée « ne plus contacter »", () => {
    expect(calculerPriorite({ entreprise: base({ statut: "ecartee" }), contacts: [contact()], nbMessages: 0 }).exclue).toBe(true);
    expect(calculerPriorite({ entreprise: base({ politique_candidature: "ne_pas_recontacter" }), contacts: [], nbMessages: 0 }).exclue).toBe(true);
  });

  it("traite les secteurs proches et inconnus comme moins prioritaires, et une petite structure comme un frein", () => {
    const proche = calculerPriorite({ entreprise: base({ secteur: "E-commerce et marketplaces" }), contacts: [], nbMessages: 0 });
    const inconnu = calculerPriorite({ entreprise: base({ secteur: null }), contacts: [], nbMessages: 0 });
    expect(proche.score).toBe(50);
    expect(inconnu.score).toBe(45);
    expect(calculerPriorite({ entreprise: base({ tranche_effectif: "11" }), contacts: [], nbMessages: 0 }).freins).toContain("petite structure");
  });
});

describe("resumerPriorite", () => {
  it("écrit les atouts puis les freins en clair", () => {
    const p = calculerPriorite({ entreprise: base({ offre_reperee_url: "https://exemple.fr/o" }), contacts: [contact()], nbMessages: 0 });
    expect(resumerPriorite(p)).toContain("secteur cible");
    expect(resumerPriorite(p)).toContain("mais : offre publiée");
  });

  it("explique une exclusion", () => {
    expect(resumerPriorite({ score: 0, raisons: [], freins: ["écartée ou « ne plus contacter »"], exclue: true })).toContain("écartée");
  });
});
