import { describe, expect, it } from "vitest";
import { rendreCv, type CvModele } from "@/lib/documents/cv-modele";

// Données fictives : le modèle ne contient aucune donnée personnelle.
const cv: CvModele = {
  nom: "PRÉNOM NOM",
  titre: "Category Manager | Trade Marketing",
  contact: ["Paris, France", "+33 1 23 45 67 89", "prenom.nom@exemple.fr"],
  liens: [{ texte: "LinkedIn", url: "https://www.linkedin.com/in/exemple/" }, { texte: "Available immediately" }],
  accroche: "Category Manager with experience on the manufacturer and retailer sides.",
  titresSections: { competences: "Skills", experiences: "Professional experience", formation: "Education", interets: "Interests" },
  competences: [{ label: "Tools", texte: "SAP · Excel" }],
  experiences: [
    {
      titre: "Category Manager — Société Exemple",
      periode: "01/2024 – 06/2025",
      detail: "Paris, France · Retail",
      points: ["Managed **3 to 4 promotional proofs per week**: wording, visuals and prices."],
    },
    { titre: "Job search — certification", periode: "07/2025 – 09/2025", points: [] },
  ],
  formations: [{ titre: "Master's in Marketing — École Exemple", periode: "2020 – 2022" }],
  interets: "Running · Music",
  separateurLabel: ": ",
};

// Nombre de pages d'un PDF produit par react-pdf : les objets « /Type /Page »,
// sans les « /Type /Pages » qui désignent l'arbre des pages.
function pages(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

describe("rendreCv", () => {
  it("produit un PDF d'une page à partir d'un contenu complet", async () => {
    const pdf = await rendreCv(cv);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pages(pdf)).toBe(1);
  });

  it("accepte une photo et reste sur une page", async () => {
    // PNG 1×1 pixel.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const pdf = await rendreCv(cv, png);
    expect(pages(pdf)).toBe(1);
    expect(pdf.length).toBeGreaterThan((await rendreCv(cv)).length);
  });
});
