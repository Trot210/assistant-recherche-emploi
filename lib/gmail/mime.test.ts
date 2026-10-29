import { describe, expect, it } from "vitest";
import { construireMime, encoderEnTete, versBase64Url } from "@/lib/gmail/mime";

describe("encoderEnTete", () => {
  it("laisse passer l'ASCII et encode les accents en RFC 2047", () => {
    expect(encoderEnTete("Candidature Category Manager")).toBe("Candidature Category Manager");
    const encode = encoderEnTete("Candidature spontanée");
    expect(encode).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
    const base64 = encode.slice("=?UTF-8?B?".length, -2);
    expect(Buffer.from(base64, "base64").toString("utf-8")).toBe("Candidature spontanée");
  });
});

describe("construireMime", () => {
  it("encode le corps en base64 UTF-8 et conserve les accents", () => {
    const mime = construireMime({ a: "marie@exemple.fr", objet: "Bonjour", corps: "Élan créatif\nLigne 2" });
    expect(mime).toContain("To: marie@exemple.fr");
    expect(mime).toContain("Content-Type: text/plain; charset=UTF-8");
    const corps = mime.split("\r\n\r\n")[1];
    expect(Buffer.from(corps.replace(/\r\n/g, ""), "base64").toString("utf-8")).toBe(
      "Élan créatif\r\nLigne 2",
    );
  });

  it("produit un multipart avec la pièce jointe quand un CV est fourni", () => {
    const mime = construireMime({
      a: "marie@exemple.fr",
      objet: "Candidature",
      corps: "Bonjour",
      pieceJointe: { nomFichier: "CV.pdf", contentType: "application/pdf", contenu: Buffer.from("%PDF-1.4") },
    });
    expect(mime).toMatch(/Content-Type: multipart\/mixed; boundary="(.+)"/);
    expect(mime).toContain('Content-Disposition: attachment; filename="CV.pdf"');
    expect(mime).toContain(Buffer.from("%PDF-1.4").toString("base64"));
    const frontiere = /boundary="(.+)"/.exec(mime)![1];
    expect(mime.trimEnd().endsWith(`--${frontiere}--`)).toBe(true);
  });

  it("refuse une injection d'en-tête par saut de ligne", () => {
    expect(() =>
      construireMime({ a: "x@y.fr\r\nBcc: autre@y.fr", objet: "Objet", corps: "Corps" }),
    ).toThrow(/saut de ligne/);
    expect(() => construireMime({ a: "x@y.fr", objet: "Objet\nBcc: z@y.fr", corps: "Corps" })).toThrow(
      /saut de ligne/,
    );
  });
});

describe("versBase64Url", () => {
  it("n'utilise ni + ni / ni de remplissage =", () => {
    const resultat = versBase64Url("à?>>>é???~~~");
    expect(resultat).not.toMatch(/[+/=]/);
  });
});
