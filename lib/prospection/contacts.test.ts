import { describe, expect, it } from "vitest";
import { choisirMeilleurContact, pertinenceContact } from "@/lib/prospection/contacts";
import type { ContactEntreprise } from "@/types/prospection";

function contact(surcharge: Partial<ContactEntreprise>): ContactEntreprise {
  return {
    id: "c",
    user_id: "u",
    entreprise_id: "e",
    nom: "Nom",
    poste: null,
    email: "x@y.fr",
    source_email: null,
    source_url: null,
    origine: "manuel",
    generique: false,
    pays: null,
    langue: null,
    email_statut: "ok",
    email_verification: null,
    email_verifie_at: null,
    created_at: "2026-10-29T00:00:00Z",
    ...surcharge,
  };
}

describe("choisirMeilleurContact", () => {
  it("préfère le responsable du métier visé, puis le recruteur, puis l'adresse générique", () => {
    const responsable = contact({ id: "r", poste: "Head of Trade Marketing" });
    const recruteur = contact({ id: "t", poste: "Talent Acquisition Partner" });
    const generique = contact({ id: "g", nom: "Recrutement", generique: true, poste: "Candidatures spontanées" });

    expect(choisirMeilleurContact([generique, recruteur, responsable], "Trade Marketing")?.id).toBe("r");
    expect(choisirMeilleurContact([generique, recruteur], "Trade Marketing")?.id).toBe("t");
    expect(choisirMeilleurContact([generique], "Trade Marketing")?.id).toBe("g");
  });

  it("ignore les contacts sans adresse e-mail", () => {
    expect(choisirMeilleurContact([contact({ email: null, poste: "Category Manager" })], "Category Manager")).toBeNull();
    expect(choisirMeilleurContact([], "Category Manager")).toBeNull();
  });

  it("adapte le choix au poste visé", () => {
    const categorie = contact({ id: "c", poste: "Category Manager" });
    const marketing = contact({ id: "m", poste: "Trade Marketing Manager" });
    expect(choisirMeilleurContact([marketing, categorie], "Category Manager")?.id).toBe("c");
    expect(choisirMeilleurContact([categorie, marketing], "Trade Marketing")?.id).toBe("m");
  });

  it("préfère un manager à un superviseur terrain quand le métier ne départage pas", () => {
    const superviseur = contact({ id: "s", poste: "Sales Supervisor" });
    const manager = contact({ id: "m", poste: "National Retail Sales Manager" });
    expect(choisirMeilleurContact([superviseur, manager], "Chef de Produit")?.id).toBe("m");
    expect(choisirMeilleurContact([manager, superviseur], "Chef de Produit")?.id).toBe("m");
  });

  it("ne propose jamais une adresse invalide ou dont le titulaire ne veut plus être contacté", () => {
    const rebond = contact({ id: "a", poste: "Head of Trade Marketing", email_statut: "invalide" });
    const refus = contact({ id: "b", poste: "Director Trade Marketing", email_statut: "ne_plus_contacter" });
    const bon = contact({ id: "c", poste: "Assistant" });
    expect(choisirMeilleurContact([rebond, refus, bon], "Trade Marketing")?.id).toBe("c");
    expect(choisirMeilleurContact([rebond, refus], "Trade Marketing")).toBeNull();
  });

  it("à poste égal, préfère l'adresse vérifiée", () => {
    const verifiee = contact({ id: "v", poste: "Head of Trade Marketing", email_verification: "valide" });
    const autre = contact({ id: "a", poste: "Head of Trade Marketing" });
    expect(choisirMeilleurContact([autre, verifiee], "Trade Marketing")?.id).toBe("v");
  });
});

describe("pertinenceContact", () => {
  const role = (poste: string | null, generique = false) => pertinenceContact(contact({ poste, generique }), "Category Manager").role;

  it("reconnaît le décideur, le recruteur et la fonction RH", () => {
    expect(role("Marketing Director")).toBe("decideur");
    expect(role("Regional Sales Director")).toBe("decideur");
    expect(role("Head of Category")).toBe("decideur");
    expect(role("Talent Acquisition Specialist")).toBe("recruteur");
    expect(role("Chargée de recrutement")).toBe("recruteur");
    expect(role("Head of HR")).toBe("rh");
    expect(role("Human Resources Director")).toBe("rh");
    expect(role("Administration Manager France")).toBe("autre");
    expect(role(null)).toBe("autre");
  });

  it("classe le décideur avant le recruteur, et les directions RH en dernier", () => {
    const score = (poste: string) => pertinenceContact(contact({ poste }), "Category Manager").score;
    expect(score("Marketing Director")).toBeGreaterThan(score("Talent Acquisition Specialist"));
    expect(score("Talent Acquisition Specialist")).toBeGreaterThan(score("HR Director"));
    expect(score("Talent Acquisition Specialist")).toBeGreaterThan(score("Administration Manager"));
    expect(score("Administration Manager")).toBeGreaterThan(score("Chief Human Resources Officer"));
  });

  it("un poste junior passe après un poste senior du même métier", () => {
    const score = (poste: string) => pertinenceContact(contact({ poste }), "Trade Marketing").score;
    expect(score("Marketing Manager")).toBeGreaterThan(score("Marketing Assistant"));
  });

  it("choisit le décideur de marketing plutôt que le directeur RH, même pour un poste de category", () => {
    const rh = contact({ id: "rh", poste: "Human Resources Director" });
    const marketing = contact({ id: "mk", poste: "Marketing Director" });
    expect(choisirMeilleurContact([rh, marketing], "Category Manager")?.id).toBe("mk");
  });
});
