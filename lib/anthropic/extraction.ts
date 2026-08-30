import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "@/lib/anthropic/client";

const OffreExtraiteSchema = z.object({
  titre: z.string().nullable(),
  entreprise: z.string().nullable(),
  localisation: z.string().nullable(),
  type_contrat: z.string().nullable(),
  description: z.string().nullable(),
});

export type OffreExtraite = z.infer<typeof OffreExtraiteSchema>;

// Extrait les champs structurés d'une offre à partir du texte brut collé par
// l'utilisateur (copié depuis LinkedIn, Welcome to the Jungle, Indeed...).
// Ces plateformes n'ont pas d'API de lecture publique et bloquent le
// scraping automatisé — le copier-coller manuel reste la seule voie fiable,
// mais Claude évite à l'utilisateur de retaper chaque champ à la main.
export async function extraireOffreDepuisTexte(texte: string): Promise<OffreExtraite> {
  const response = await anthropic.messages.parse({
    model: "claude-opus-5",
    max_tokens: 4096,
    system: `Tu extrais les informations structurées d'une offre d'emploi à partir d'un texte brut collé par l'utilisateur (copié depuis un site comme LinkedIn, Welcome to the Jungle, Indeed ou Glassdoor).

Règles strictes :
- N'invente aucune information. Si un champ n'est pas identifiable dans le texte, mets null — y compris "titre". Ne mets JAMAIS de phrase explicative, d'excuse ou de commentaire sur l'absence de contenu dans un champ (ex: jamais "Offre non identifiable, aucun contenu fourni") : soit une vraie valeur extraite, soit null.
- Si le texte fourni est vide, ou n'est qu'un lien/URL sans texte d'offre autour (ex: juste "https://www.linkedin.com/jobs/view/..."), mets tous les champs à null : il n'y a rien à extraire d'une URL seule.
- "description" doit reprendre le contenu réel de l'offre (missions, profil recherché, responsabilités) tel qu'il apparaît dans le texte source, nettoyé du bruit (menus de navigation, boutons "Postuler", bannières cookies, compteurs de vues, etc.) — ne résume pas et ne reformule pas le contenu, garde-le fidèle et complet pour qu'il reste utilisable pour évaluer la compatibilité du candidat.
- "type_contrat" doit être une valeur courte si identifiable (CDI, CDD, V.I.E, Intérim, Freelance, Alternance, Stage), sinon null.`,
    messages: [
      {
        role: "user",
        content: `Texte brut collé par l'utilisateur :\n\n${texte}`,
      },
    ],
    output_config: {
      format: zodOutputFormat(OffreExtraiteSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error("Impossible de parser l'extraction de l'offre");
  }

  return response.parsed_output;
}
