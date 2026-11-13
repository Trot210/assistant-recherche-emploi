import { describe, expect, it } from "vitest";
import { corpsDuMessage, sansImagesIntegrees, texteDepuisHtml } from "@/lib/mail/imap";

describe("corpsDuMessage", () => {
  it("garde la partie texte quand elle contient du texte", () => {
    expect(corpsDuMessage({ text: "Bonjour, nous avons bien reçu votre candidature.", html: "<p>autre</p>" })).toContain("bien reçu");
  });

  it("retombe sur le HTML quand la partie texte est vide ou réduite à un espace", () => {
    const html = "<html><body><p>Nous avons étudié votre candidature. Malheureusement, nous ne pouvons y donner suite.</p></body></html>";
    expect(corpsDuMessage({ text: " ", html })).toContain("Malheureusement");
    expect(corpsDuMessage({ text: "", html })).toContain("Malheureusement");
    expect(corpsDuMessage({ html })).toContain("Malheureusement");
  });

  it("renvoie le texte tel quel sans HTML", () => {
    expect(corpsDuMessage({ text: "court" })).toBe("court");
    expect(corpsDuMessage({})).toBe("");
  });
});

describe("texteDepuisHtml", () => {
  it("ignore les images intégrées en base64 et garde le texte", () => {
    const html = `<table><tr><td><img src="data:image/png;base64,${"A".repeat(5000)}"></td></tr><tr><td>Bonjour Lucien</td></tr></table>`;
    const texte = texteDepuisHtml(html);
    expect(texte).toContain("Bonjour Lucien");
    expect(texte).not.toContain("base64");
  });
});

describe("images intégrées dans la partie texte", () => {
  const logo = `[data:image/png;base64,${"iVBORw0KGgo".repeat(40_000)}]`;
  const texte = `${logo}\n\nBonjour Lucien, nous avons étudié votre candidature. Malheureusement, notre choix s'est porté sur un autre profil.`;

  it("retire l'image et garde le texte, même s'il vient après elle", () => {
    const propre = sansImagesIntegrees(texte);
    expect(propre).not.toContain("base64");
    expect(propre.indexOf("Malheureusement")).toBeLessThan(200);
  });

  it("corpsDuMessage rend un texte court et lisible", () => {
    const corps = corpsDuMessage({ text: texte });
    expect(corps.length).toBeLessThan(400);
    expect(corps).toContain("Malheureusement");
  });
});
