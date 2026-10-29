import { describe, expect, it } from "vitest";
import { suggererLangue, suggererLangueContact } from "@/lib/prospection/langue";

describe("suggererLangue", () => {
  it("part du pays quand il est connu", () => {
    expect(suggererLangue({ pays: "fr" })).toMatchObject({ langue: "fr" });
    expect(suggererLangue({ pays: "BE" })).toMatchObject({ langue: "fr" });
    expect(suggererLangue({ pays: "US" })).toMatchObject({ langue: "en" });
    expect(suggererLangue({ pays: "DE", email: "a@b.fr" })).toMatchObject({ langue: "en" });
  });

  it("déduit la langue de l'extension de l'adresse e-mail", () => {
    expect(suggererLangue({ email: "marie@bel.fr" })).toMatchObject({ langue: "fr", raison: "adresse en .fr" });
    expect(suggererLangue({ email: "anna@firma.de" })).toMatchObject({ langue: "en", raison: "adresse en .de" });
    expect(suggererLangue({ email: "john@firm.co.uk" })).toMatchObject({ langue: "en", raison: "adresse en .uk" });
  });

  it("reste en français pour une extension générique ou sans indice", () => {
    expect(suggererLangue({ email: "marie@groupe-bel.com" })).toMatchObject({ langue: "fr" });
    expect(suggererLangue({})).toMatchObject({ langue: "fr" });
  });
});

describe("suggererLangueContact", () => {
  it("respecte le choix explicite fait sur le contact", () => {
    expect(suggererLangueContact({ email: "a@b.fr", pays: null, langue: "en" })).toMatchObject({
      langue: "en",
      raison: "choisie pour ce contact",
    });
  });

  it("retombe sur les indices sinon", () => {
    expect(suggererLangueContact({ email: "a@b.es", pays: null, langue: null })).toMatchObject({ langue: "en" });
  });
});
