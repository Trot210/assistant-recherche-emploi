import { describe, expect, it } from "vitest";
import { choisirMeilleurContact } from "@/lib/prospection/contacts";
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
