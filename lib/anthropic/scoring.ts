// Le helper zodOutputFormat du SDK Anthropic est construit sur l'API zod/v4
// (disponible en sous-chemin depuis zod 3.25+) — un schéma zod classique
// (import { z } from "zod") ne correspond pas au type ZodType attendu.
import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "@/lib/anthropic/client";
import type { Profil } from "@/types/profil";
import type { Offre } from "@/types/offre";

const ScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  points_forts: z.array(z.string()),
  ecarts: z.array(z.string()),
});

export type ScoringResult = z.infer<typeof ScoreSchema>;

export async function scoreCompatibilite(
  profil: Profil,
  offre: Offre,
): Promise<ScoringResult> {
  const response = await anthropic.messages.parse({
    model: "claude-opus-5",
    max_tokens: 4096,
    system:
      "Tu es un assistant de recherche d'emploi qui évalue la compatibilité entre le profil d'un candidat et une offre d'emploi. Sois factuel, concis et base-toi uniquement sur les informations fournies.",
    messages: [
      {
        role: "user",
        content: `Profil du candidat :
Compétences : ${profil.competences.length > 0 ? profil.competences.join(", ") : "non renseignées"}
Expériences : ${profil.experiences.length > 0 ? JSON.stringify(profil.experiences) : "non renseignées"}
CV : ${profil.cv_texte ?? "non renseigné"}
Préférences : ${JSON.stringify(profil.preferences)}

Offre d'emploi :
Titre : ${offre.titre}
Entreprise : ${offre.entreprise ?? "non renseignée"}
Localisation : ${offre.localisation ?? "non renseignée"}
Description : ${offre.description ?? "non renseignée"}

Évalue la compatibilité de ce candidat avec cette offre sur 100, liste les points forts (ce qui correspond bien) et les écarts (ce qui manque ou ne correspond pas).`,
      },
    ],
    output_config: {
      format: zodOutputFormat(ScoreSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error("Impossible de parser la réponse de scoring de Claude");
  }

  return response.parsed_output;
}
