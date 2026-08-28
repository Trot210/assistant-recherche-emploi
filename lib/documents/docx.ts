import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import type { CVContent } from "@/lib/anthropic/documents";

export async function buildCvDocx(cv: CVContent): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ text: "Curriculum Vitae", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun({ text: cv.accroche, italics: true })] }),
    new Paragraph({ text: "" }),
    new Paragraph({ text: "Compétences", heading: HeadingLevel.HEADING_2 }),
    ...cv.competences_mises_en_avant.map(
      (competence) => new Paragraph({ text: competence, bullet: { level: 0 } }),
    ),
    new Paragraph({ text: "" }),
    new Paragraph({ text: "Expérience", heading: HeadingLevel.HEADING_2 }),
    ...cv.experiences.flatMap((exp) => [
      new Paragraph({
        children: [new TextRun({ text: `${exp.poste} — ${exp.entreprise}`, bold: true })],
      }),
      new Paragraph({ children: [new TextRun({ text: exp.periode, italics: true })] }),
      ...exp.points_cles.map((point) => new Paragraph({ text: point, bullet: { level: 0 } })),
      new Paragraph({ text: "" }),
    ]),
    new Paragraph({ text: "Formation", heading: HeadingLevel.HEADING_2 }),
    ...cv.formation.map((diplome) => new Paragraph({ text: diplome, bullet: { level: 0 } })),
  ];

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export async function buildLettreDocx(lettre: string): Promise<Buffer> {
  const paragraphs = lettre
    .split(/\n{2,}/)
    .map(
      (paragraphe) =>
        new Paragraph({
          children: [new TextRun(paragraphe.trim())],
          spacing: { after: 200 },
        }),
    );

  const doc = new Document({ sections: [{ children: paragraphs }] });
  return Packer.toBuffer(doc);
}
