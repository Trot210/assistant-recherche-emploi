import { describe, expect, it } from "vitest";
import { cheminCvReference, libelleCv, nomPieceJointeCv, validerPdf } from "@/lib/prospection/cv";

const octets = (texte: string) => new TextEncoder().encode(texte);

describe("validerPdf", () => {
  it("accepte un PDF et refuse tout autre contenu", () => {
    expect(validerPdf(octets("%PDF-1.3\n..."))).toBeNull();
    expect(validerPdf(octets("<html>pas un pdf</html>"))).toBe("Ce fichier n'est pas un PDF");
    expect(validerPdf(new Uint8Array())).toBe("Le fichier est vide");
  });

  it("refuse un fichier de plus de 5 Mo", () => {
    const gros = new Uint8Array(5 * 1024 * 1024 + 1);
    gros.set(octets("%PDF-"));
    expect(validerPdf(gros)).toBe("Le CV dépasse 5 Mo");
  });
});

describe("nomPieceJointeCv", () => {
  it("construit un nom lisible, sans caractère dangereux pour un en-tête", () => {
    expect(nomPieceJointeCv("Lucien Tamba")).toBe("CV Lucien Tamba.pdf");
    expect(nomPieceJointeCv('Jean-Éric "O\'Neil"\r\nBcc: x@y.fr')).toBe("CV Jean-Éric O'Neil Bcc x y fr.pdf");
    expect(nomPieceJointeCv(null)).toBe("CV.pdf");
  });

  it("distingue la pièce jointe anglaise", () => {
    expect(nomPieceJointeCv("Lucien Tamba", "en")).toBe("CV Lucien Tamba (English).pdf");
    expect(nomPieceJointeCv(null, "en")).toBe("CV (English).pdf");
  });
});

describe("cheminCvReference", () => {
  it("range le CV dans le dossier de l'utilisateur", () => {
    expect(cheminCvReference("u-1")).toBe("u-1/cv-reference.pdf");
  });

  it("utilise un fichier distinct par langue", () => {
    expect(cheminCvReference("u-1", "fr")).toBe("u-1/cv-reference.pdf");
    expect(cheminCvReference("u-1", "en")).toBe("u-1/cv-reference-en.pdf");
    expect(libelleCv("en")).toBe("CV en anglais");
  });
});
