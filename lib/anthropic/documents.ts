import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "@/lib/anthropic/client";
import type { Profil } from "@/types/profil";
import type { Offre } from "@/types/offre";

// Bornes strictes pour garantir un CV tenant sur une seule page A4, quoi
// que renvoie le modèle : appliquées à la fois dans le prompt et en dur
// après coup (clampCvContent), en défense en profondeur.
const MAX_ACCROCHE_CHARS = 480;
const MAX_COMPETENCES = 10;
const MAX_POINTS_PAR_EXPERIENCE = 5;
const MAX_POINT_CHARS = 135;

const CVContentSchema = z.object({
  accroche: z
    .string()
    .describe(
      `Paragraphe de profil en tête de CV (2-3 phrases MAXIMUM, ${MAX_ACCROCHE_CHARS} caractères maximum), positionnant le candidat par rapport à cette offre précise`,
    ),
  competences_mises_en_avant: z
    .array(z.string())
    .describe(
      `Exactement ${MAX_COMPETENCES} compétences maximum du profil, courtes (2-4 mots), sélectionnées pour matcher cette offre, par ordre de pertinence`,
    ),
  experiences: z.array(
    z.object({
      poste: z.string(),
      entreprise: z.string(),
      lieu: z.string().optional(),
      periode: z.string(),
      points: z
        .array(z.string())
        .describe(
          `${MAX_POINTS_PAR_EXPERIENCE} points MAXIMUM par expérience, les plus pertinents pour cette offre, une phrase courte et dense chacun (une seule ligne, pas de sous-titres)`,
        ),
    }),
  ),
});

export type CVContent = z.infer<typeof CVContentSchema>;

function clampCvContent(cv: CVContent): CVContent {
  const tronquer = (texte: string, max: number) =>
    texte.length <= max ? texte : `${texte.slice(0, max).replace(/\s+\S*$/, "")}…`;

  return {
    accroche: tronquer(cv.accroche, MAX_ACCROCHE_CHARS),
    competences_mises_en_avant: cv.competences_mises_en_avant.slice(0, MAX_COMPETENCES),
    experiences: cv.experiences.map((exp) => ({
      ...exp,
      points: exp.points
        .slice(0, MAX_POINTS_PAR_EXPERIENCE)
        .map((point) => tronquer(point, MAX_POINT_CHARS)),
    })),
  };
}

function contexte(profil: Profil, offre: Offre): string {
  return `Profil du candidat :
Compétences : ${profil.competences.length > 0 ? profil.competences.join(", ") : "non renseignées"}
Expériences (données réelles, structurées par sous-thèmes) : ${
    profil.experiences.length > 0 ? JSON.stringify(profil.experiences) : "non renseignées"
  }
CV (texte libre complémentaire) : ${profil.cv_texte ?? "non renseigné"}

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
    system: `Tu adaptes le CV d'un candidat pour une offre d'emploi précise, au format d'un CV finance/conseil : dense, factuel, sans blabla.

Contrainte impérative : le CV final doit tenir sur UNE SEULE page A4. Pour cela :
- Garde TOUTES les expériences du profil (ne supprime aucun employeur, la continuité du parcours compte), mais sélectionne au maximum ${MAX_POINTS_PAR_EXPERIENCE} points par expérience — les plus pertinents pour CETTE offre, parmi les points réels fournis dans sous_sections.
- Chaque point tient sur une seule phrase courte et dense (pas de sous-titres de sous-section, un point = une ligne).
- Le paragraphe d'accroche fait 2-3 phrases maximum.
- Maximum ${MAX_COMPETENCES} compétences mises en avant, formulées en 2-4 mots chacune.

N'invente jamais un fait, un chiffre ou une réalisation absent du profil fourni — tu sélectionnes et reformules, tu ne crées pas.`,
    messages: [{ role: "user", content: contexte(profil, offre) }],
    output_config: {
      format: zodOutputFormat(CVContentSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error("Impossible de parser le contenu du CV généré par Claude");
  }

  return clampCvContent(response.parsed_output);
}

export async function genererLettreMotivation(profil: Profil, offre: Offre): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 4096,
    system:
      "Tu rédiges une lettre de motivation en français, professionnelle et personnalisée, à partir du profil réel d'un candidat et d'une offre d'emploi précise. Adopte le même registre factuel et dense que le CV du candidat (orienté résultats, précis, pas de formules toutes faites génériques), pour que lettre et CV se lisent comme un ensemble cohérent. Contrainte impérative : la lettre doit remplir une page A4 sans déborder sur une deuxième — vise 420-480 mots répartis sur 5 paragraphes développés (pas de phrases trop courtes ni de liste à puces). Pas d'invention d'expérience, de chiffre ou de compétence absente du profil. Réponds uniquement avec le texte de la lettre, sans commentaire ni balisage, sans en-tête ni formule d'adresse (le nom et les coordonnées du candidat sont ajoutés séparément).",
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
