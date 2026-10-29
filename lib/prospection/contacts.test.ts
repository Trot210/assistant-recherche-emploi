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
});
