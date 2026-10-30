import { describe, expect, it } from "vitest";
import {
  appliquerPatron,
  candidatsAdresses,
  decouperNomComplet,
  deduireFormat,
  detecterPatron,
  domaineAdresses,
  nettoyerNomPropre,
  patronDepuisHunter,
} from "@/lib/prospection/adresses";

describe("nettoyerNomPropre", () => {
  it("retire accents, apostrophes et espaces mais garde le trait d'union", () => {
    expect(nettoyerNomPropre("Hélène")).toBe("helene");
    expect(nettoyerNomPropre("D'Angelo")).toBe("dangelo");
    expect(nettoyerNomPropre("Favet-Richard")).toBe("favet-richard");
    expect(nettoyerNomPropre("De La Fontaine")).toBe("delafontaine");
  });
});

describe("appliquerPatron et detecterPatron", () => {
  it("construit la partie locale selon le format", () => {
    expect(appliquerPatron("{first}.{last}", "Marie", "Dupont")).toEqual(["marie.dupont"]);
    expect(appliquerPatron("{f}{last}", "Marie", "Dupont")).toEqual(["mdupont"]);
    expect(appliquerPatron("{last}.{first}", "Marie", "Dupont")).toEqual(["dupont.marie"]);
    expect(appliquerPatron("{first}{l}", "Marie", "Dupont")).toEqual(["maried"]);
  });

  it("propose les variantes avec et sans trait d'union", () => {
    expect(appliquerPatron("{first}.{last}", "Anne-Lise", "Favet-Richard")).toEqual([
      "anne-lise.favet-richard",
      "anne-lise.favetrichard",
      "annelise.favet-richard",
      "annelise.favetrichard",
    ]);
  });

  it("reconnaît le format d'une adresse connue", () => {
    expect(detecterPatron("amanda.lobato", "Amanda", "Lobato")).toBe("{first}.{last}");
    expect(detecterPatron("fghedjati", "Fouzi", "Ghedjati")).toBe("{f}{last}");
    expect(detecterPatron("anne-lise.favet-richard", "Anne-Lise", "Favet-Richard")).toBe("{first}.{last}");
    expect(detecterPatron("contact", "Marie", "Dupont")).toBeNull();
  });

  it("n'invente rien sans prénom ou sans nom", () => {
    expect(appliquerPatron("{first}.{last}", "", "Dupont")).toEqual([]);
  });
});

describe("decouperNomComplet", () => {
  it("sépare le prénom du reste, et refuse un mot seul", () => {
    expect(decouperNomComplet("Marie Dupont")).toEqual({ prenom: "Marie", nom: "Dupont" });
    expect(decouperNomComplet("Jean De La Fontaine")).toEqual({ prenom: "Jean", nom: "De La Fontaine" });
    expect(decouperNomComplet("Madonna")).toBeNull();
  });
});

describe("deduireFormat", () => {
  const connues = [
    { nom: "Amanda Lobato", email: "amanda.lobato@opella.com" },
    { nom: "Rashmi Gupta", email: "rashmi.gupta@opella.com" },
    { nom: "Raul Calvarro", email: "rcalvarro@opella.com" },
    { nom: "Recrutement", email: "jobs@opella.com", generique: true },
    { nom: "Autre Personne", email: "autre.personne@autre.com" },
  ];

  it("retient le format le plus fréquent du domaine, avec les autres en secours", () => {
    expect(deduireFormat(connues, "opella.com")).toEqual({
      patron: "{first}.{last}",
      observations: 2,
      total: 3,
      autres: ["{f}{last}"],
    });
  });

  it("ignore les adresses génériques et les autres domaines, et rend null sans rien d'exploitable", () => {
    expect(deduireFormat(connues, "autre.com")?.patron).toBe("{first}.{last}");
    expect(deduireFormat(connues, "inconnu.com")).toBeNull();
    expect(deduireFormat([{ nom: "Recrutement", email: "jobs@x.fr", generique: true }], "x.fr")).toBeNull();
  });
});

describe("candidatsAdresses", () => {
  it("commence par le format du domaine, puis ses autres formats, puis les formats courants", () => {
    const format = { patron: "{f}{last}" as const, observations: 3, total: 3, autres: [] };
    const c = candidatsAdresses({ prenom: "Marie", nom: "Dupont", domaine: "groupe-bel.com", format });
    expect(c.map((x) => x.email)).toEqual(["mdupont@groupe-bel.com", "marie.dupont@groupe-bel.com", "mariedupont@groupe-bel.com"]);
    expect(c[0].patron).toBe("{f}{last}");
  });

  it("utilise le format donné par Hunter quand le domaine n'en révèle aucun", () => {
    const c = candidatsAdresses({ prenom: "Marie", nom: "Dupont", domaine: "x.fr", patronHunter: "{first}{last}" });
    expect(c[0].email).toBe("mariedupont@x.fr");
  });

  it("ne dépasse pas trois candidats et n'a pas de doublon", () => {
    const c = candidatsAdresses({ prenom: "Anne-Lise", nom: "Favet-Richard", domaine: "opella.com" });
    expect(c).toHaveLength(3);
    expect(new Set(c.map((x) => x.email)).size).toBe(3);
  });
});

describe("patronDepuisHunter et domaineAdresses", () => {
  it("n'accepte que les formats connus", () => {
    expect(patronDepuisHunter("{first}.{last}")).toBe("{first}.{last}");
    expect(patronDepuisHunter("{x}@{y}")).toBeNull();
    expect(patronDepuisHunter(null)).toBeNull();
  });

  it("préfère le domaine des adresses connues à celui du site web", () => {
    const adresses = [
      { nom: "A B", email: "a.b@mondelezinternational.com" },
      { nom: "C D", email: "c.d@mondelezinternational.com" },
    ];
    expect(domaineAdresses(adresses, "mondelez.com")).toBe("mondelezinternational.com");
    expect(domaineAdresses([], "mondelez.com")).toBe("mondelez.com");
  });
});
