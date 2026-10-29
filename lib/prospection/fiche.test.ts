import { describe, expect, it } from "vitest";
import {
  assainirFiche,
  choisirSiteDansResultats,
  cleUrl,
  extraireDomaine,
  pageMentionne,
  resumerFiche,
  type FicheBrute,
} from "@/lib/prospection/fiche";

const sources = {
  urls: ["https://www.bel-group.com/fr/carrieres/", "https://presse.exemple.fr/article-1"],
  extraits: [
    { url: "https://www.bel-group.com/fr/carrieres/", texte: "Écrivez-nous : recrutement@bel-group.com pour toute candidature" },
  ],
};

function brute(surcharge: Partial<FicheBrute> = {}): FicheBrute {
  return {
    site_web: "https://www.bel-group.com",
    activite: "Fromager",
    marques: [{ texte: "La vache qui rit", source_url: "https://bel-group.com/fr/carrieres" }],
    enjeux: [],
    actualites: [],
    adresse_candidature: null,
    contacts_publics: [],
    postes_suggeres: [],
    ...surcharge,
  };
}

describe("cleUrl / extraireDomaine", () => {
  it("ignore schéma, www, casse, fragment et slash final", () => {
    expect(cleUrl("HTTP://www.Exemple.fr/Page/#haut")).toBe("exemple.fr/page");
    expect(cleUrl("javascript:alert(1)")).toBeNull();
    expect(cleUrl("pas une url")).toBeNull();
  });

  it("extrait le domaine d'un site", () => {
    expect(extraireDomaine("https://www.bel-group.com/fr")).toBe("bel-group.com");
    expect(extraireDomaine("bel-group.com")).toBe("bel-group.com");
    expect(extraireDomaine(null)).toBeNull();
  });
});

describe("assainirFiche", () => {
  it("écarte les faits dont le lien n'a pas été consulté par la recherche", () => {
    const fiche = assainirFiche(
      brute({
        marques: [
          { texte: "La vache qui rit", source_url: "https://bel-group.com/fr/carrieres" },
          { texte: "Marque inventée", source_url: "https://site-invente.fr/page" },
          { texte: "   ", source_url: "https://presse.exemple.fr/article-1" },
        ],
      }),
      sources,
    );
    expect(fiche.marques.map((m) => m.texte)).toEqual(["La vache qui rit"]);
  });

  it("confirme une adresse seulement si elle figure dans un extrait cité", () => {
    const confirmee = assainirFiche(
      brute({ adresse_candidature: { email: "Recrutement@bel-group.com", source_url: "https://www.bel-group.com/fr/carrieres/" } }),
      sources,
    );
    expect(confirmee.adresse_candidature).toMatchObject({ email: "Recrutement@bel-group.com", confirmee: true });

    const nonConfirmee = assainirFiche(
      brute({ adresse_candidature: { email: "rh@bel-group.com", source_url: "https://www.bel-group.com/fr/carrieres/" } }),
      sources,
    );
    expect(nonConfirmee.adresse_candidature).toMatchObject({ email: "rh@bel-group.com", confirmee: false });
  });

  it("rejette une adresse mal formée ou rattachée à un lien inconnu", () => {
    expect(
      assainirFiche(brute({ adresse_candidature: { email: "pas-un-email", source_url: sources.urls[0] } }), sources)
        .adresse_candidature,
    ).toBeNull();
    expect(
      assainirFiche(brute({ adresse_candidature: { email: "rh@bel-group.com", source_url: "https://autre.fr/x" } }), sources)
        .adresse_candidature,
    ).toBeNull();
  });

  it("retire l'e-mail d'un contact public s'il n'est pas cité, mais garde le nom et la source", () => {
    const fiche = assainirFiche(
      brute({
        contacts_publics: [
          { nom: "Marie Dupont", poste: "Directrice Trade Marketing", email: "marie.dupont@bel-group.com", source_url: "https://presse.exemple.fr/article-1" },
        ],
      }),
      sources,
    );
    expect(fiche.contacts_publics).toEqual([
      { nom: "Marie Dupont", poste: "Directrice Trade Marketing", email: null, source_url: "https://presse.exemple.fr/article-1" },
    ]);
  });

  it("ramène les postes suggérés à la liste ciblée, sans doublon", () => {
    const fiche = assainirFiche(
      brute({
        postes_suggeres: [
          { poste: "category manager", raison: "Grande distribution" },
          { poste: "Category Manager", raison: "Doublon" },
          { poste: "Astronaute", raison: "Hors liste" },
        ],
      }),
      sources,
    );
    expect(fiche.postes_suggeres).toEqual([{ poste: "Category Manager", raison: "Grande distribution" }]);
  });

  it("ne garde pas un site web invalide", () => {
    expect(assainirFiche(brute({ site_web: "n'importe quoi" }), sources).site_web).toBeNull();
  });
});

describe("resumerFiche", () => {
  it("est vide sans fiche et liste les faits sinon", () => {
    expect(resumerFiche(null)).toBe("");
    const fiche = assainirFiche(brute(), sources);
    expect(resumerFiche(fiche)).toContain("Marques : La vache qui rit");
  });
});

describe("choisirSiteDansResultats", () => {
  it("retient le site de l'entreprise et écarte annuaires et réseaux sociaux", () => {
    const urls = [
      "https://fr.linkedin.com/company/campari-france",
      "https://www.pagesjaunes.fr/pros/64920220",
      "https://www.societe.com/societe/campari-france-511042368.html",
      "https://www.campari.com/fr-fr/nos-produits/",
    ];
    expect(choisirSiteDansResultats(urls, "CAMPARI FRANCE (CAMPARI FRANCE) (CF)")).toBe("https://www.campari.com/");
  });

  it("reconnaît un nom court dans un domaine composé et ignore les noms qui ne correspondent pas", () => {
    expect(
      choisirSiteDansResultats(["https://www.groupe-bel.com/fr/", "https://www.belle-vue.fr/"], "BEL (LA VACHE QUI RIT - FBSA) (F.B.S.A)"),
    ).toBe("https://www.groupe-bel.com/");
    expect(choisirSiteDansResultats(["https://www.autre-marque.fr/"], "LIDL (LIDL)")).toBeNull();
  });

  it("ne tient pas compte des mots génériques du nom", () => {
    expect(choisirSiteDansResultats(["https://www.france-voyages.fr/"], "SOCIETE FRANCE SAS")).toBeNull();
  });
});

describe("pageMentionne", () => {
  it("reconnaît le nom de l'entreprise dans une page, sans tenir compte des accents ni de la casse", () => {
    expect(pageMentionne("<title>Lidl France | Supermarché</title>", "LIDL (LIDL)")).toBe(true);
    expect(pageMentionne("<title>Domaine à vendre</title>", "LIDL (LIDL)")).toBe(false);
    expect(pageMentionne("<h1>CAUDALIE – cosmétique</h1>", "CAUDALIE (CAUDALIE)")).toBe(true);
  });

  it("ne confond pas un mot plus long avec le nom recherché", () => {
    expect(pageMentionne("<p>Une belle journée</p>", "BEL (LA VACHE QUI RIT)")).toBe(false);
  });
});
