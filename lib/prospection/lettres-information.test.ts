import { describe, expect, it } from "vitest";
import { estLundi, lienDesinscription, regrouperLettres } from "./lettres-information";

describe("lienDesinscription", () => {
  it("préfère le lien https à l'adresse mailto", () => {
    expect(lienDesinscription("List-Unsubscribe: <mailto:stop@news.example>, <https://news.example/desabo?x=1>")).toBe("https://news.example/desabo?x=1");
  });

  it("se rabat sur mailto, sinon rien", () => {
    expect(lienDesinscription("<mailto:stop@news.example>")).toBe("mailto:stop@news.example");
    expect(lienDesinscription("<http://news.example/desabo>")).toBeNull();
    expect(lienDesinscription("")).toBeNull();
  });

  it("lit un en-tête replié sur plusieurs lignes", () => {
    expect(lienDesinscription("List-Unsubscribe: <mailto:stop@news.example>,\r\n <https://news.example/desabo>")).toBe("https://news.example/desabo");
  });

  it("écarte les schémas dangereux", () => {
    expect(lienDesinscription("<javascript:alert(1)>")).toBeNull();
  });
});

describe("regrouperLettres", () => {
  it("compte par expéditeur et classe les plus bavards en premier", () => {
    const entete = "List-Unsubscribe: <https://a.example/stop>";
    const resultat = regrouperLettres([
      { adresse: "news@a.example", nom: "Lettre A", enteteDesinscription: entete },
      { adresse: "NEWS@a.example", nom: "Lettre A", enteteDesinscription: "" },
      { adresse: "info@b.example", nom: null, enteteDesinscription: "" },
    ]);
    expect(resultat).toEqual([
      { nom: "Lettre A", adresse: "news@a.example", nombre: 2, lien: "https://a.example/stop" },
      { nom: "b.example", adresse: "info@b.example", nombre: 1, lien: null },
    ]);
  });
});

describe("estLundi", () => {
  it("reconnaît le lundi", () => {
    expect(estLundi("2026-11-16")).toBe(true);
    expect(estLundi("2026-11-17")).toBe(false);
  });
});
