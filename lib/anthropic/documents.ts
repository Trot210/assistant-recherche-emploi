import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "@/lib/anthropic/client";
import type { Profil } from "@/types/profil";
import type { Offre } from "@/types/offre";

const CVContentSchema = z.object({
  accroche: z
    .string()
    .describe("Phrase d'accroche en tête de CV, positionnant le candidat par rapport à cette offre précise"),
  competences_mises_en_avant: z
    .array(z.string())
    .describe("Compétences du profil sélectionnées et reformulées pour matcher cette offre, dans l'ordre de pertinence"),
  experiences: z.array(
    z.object({
      poste: z.string(),
      entreprise: z.string(),
      periode: z.string(),
      points_cles: z
        .array(z.string())
        .describe("Réalisations/missions reformulées pour mettre en avant ce qui est pertinent pour cette offre"),
    }),
  ),
  formation: z.array(z.string()),
});

export type CVContent = z.infer<typeof CVContentSchema>;

function contexte(profil: Profil, offre: Offre): string {
  return `Profil du candidat :
Compétences : ${profil.competences.length > 0 ? profil.competences.join(", ") : "non renseignées"}
Expériences : ${profil.experiences.length > 0 ? JSON.stringify(profil.experiences) : "non renseignées"}
CV : ${profil.cv_texte ?? "non renseigné"}

Offre d'emploi :
Titre : ${offre.titre}
Entreprise : ${offre.entreprise ?? "non renseignée"}
Localisation : ${offre.localisation ?? "non renseignée"}
Description : ${offre.description ?? "non renseignée"}`;
}

export async function genererContenuCV(profil: Profil, offre: Offre): Promise<CVContent> {
  const response = await anthropic.messages.parse({
    model: "claude-opus-5",
    max_tokens: 4096,
    system:
      "Tu adaptes le CV d'un candidat pour une offre d'emploi précise. Réorganise et reformule les informations RÉELLES du profil pour mettre en avant ce qui est pertinent pour cette offre — n'invente aucune expérience, compétence ou diplôme qui ne figure pas dans le profil fourni.",
    messages: [{ role: "user", content: contexte(profil, offre) }],
    output_config: {
      format: zodOutputFormat(CVContentSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error("Impossible de parser le contenu du CV généré par Claude");
  }

  return response.parsed_output;
}

export async function genererLettreMotivation(profil: Profil, offre: Offre): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 4096,
    system:
      "Tu rédiges une lettre de motivation en français, professionnelle et personnalisée, à partir du profil réel d'un candidat et d'une offre d'emploi précise. Pas de formules toutes faites génériques, pas d'invention d'expérience ou de compétence absente du profil. Réponds uniquement avec le texte de la lettre, sans commentaire ni balisage.",
    messages: [{ role: "user", content: contexte(profil, offre) }],
  });

  const texte = response.content
    .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!texte) {
    throw new Error("Claude n'a renvoyé aucun texte pour la lettre de motivation");
  }

  return texte;
}
