import { describe, expect, it } from "vitest";
import { contactsDepuisFiche } from "@/lib/prospection/contacts-fiche";

const base = { userId: "u1", entrepriseId: "e1" };

const fiche = {
  adresse_candidature: { email: "recrutement@exemple.fr", source_url: "https://exemple.fr/carrieres", confirmee: true },
  contacts_publics: [
    { nom: "Marie Dupont", poste: "Responsable Trade Marketing", email: "marie.dupont@exemple.fr", source_url: "https://exemple.fr/equipe" },
    { nom: "Paul Martin", poste: null, email: null, source_url: "https://exemple.fr/equipe" },
  ],
};

describe("contactsDepuisFiche", () => {
  it("donne les mêmes colonnes à toutes les lignes, pour qu'une insertion groupée n'envoie aucun NULL", () => {
    const lignes = contactsDepuisFiche({ ...base, fiche, dejaConnus: [] });
    expect(lignes).toHaveLength(3);
    const colonnes = lignes.map((l) => Object.keys(l).sort().join(","));
    expect(new Set(colonnes).size).toBe(1);
    // Le cas qui plantait : une adresse générique (generique: true) avec des contacts nommés.
    expect(lignes.map((l) => l.generique)).toEqual([true, false, false]);
  });

  it("marque l'adresse générique et les contacts nommés comme tels", () => {
    const [generique, nomme] = contactsDepuisFiche({ ...base, fiche, dejaConnus: [] });
    expect(generique).toMatchObject({ nom: "Recrutement", generique: true, origine: "page_publique" });
    expect(nomme).toMatchObject({ nom: "Marie Dupont", generique: false, source_email: "Page publique : https://exemple.fr/equipe" });
  });

  it("n'ajoute pas l'adresse générique si elle n'est pas confirmée, et ne garde aucune source sans adresse", () => {
    const lignes = contactsDepuisFiche({
      ...base,
      fiche: { ...fiche, adresse_candidature: { email: "x@exemple.fr", source_url: "https://exemple.fr", confirmee: false } },
      dejaConnus: [],
    });
    expect(lignes.map((l) => l.nom)).toEqual(["Marie Dupont", "Paul Martin"]);
    expect(lignes[1].source_email).toBeNull();
  });

  it("ignore les contacts et adresses déjà connus", () => {
    const lignes = contactsDepuisFiche({
      ...base,
      fiche,
      dejaConnus: [
        { nom: "marie dupont", email: null },
        { nom: "Autre", email: "RECRUTEMENT@exemple.fr" },
      ],
    });
    expect(lignes.map((l) => l.nom)).toEqual(["Paul Martin"]);
  });

  it("fonctionne sans aucune adresse ni contact", () => {
    expect(contactsDepuisFiche({ ...base, fiche: { adresse_candidature: null, contacts_publics: [] }, dejaConnus: [] })).toEqual([]);
  });
});
