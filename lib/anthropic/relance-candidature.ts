import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "@/lib/anthropic/client";
import { nettoyerMarkdown, tronquer } from "@/lib/anthropic/documents";
import { profilPourPrompt } from "@/lib/anthropic/prospection";
import type { Profil } from "@/types/profil";

// Même modèle que les autres rédactions : texte court, quelques centimes au plus.
const MODELE = "claude-sonnet-5-5";
const MAX_CORPS = 450;

const RelanceSchema = z.object({
  corps: z.string().describe("Cœur de la relance : sans formule d'appel, sans formule de politesse finale, sans signature"),
});

const SYSTEME = `Tu rédiges la relance d'une candidature envoyée en réponse à une offre d'emploi et restée sans nouvelles. Le candidat relit, modifie et envoie lui-même : rien ne part automatiquement.

Règles :
- Deux ou trois phrases, ${MAX_CORPS} caractères maximum, registre professionnel naturel, en français (en anglais seulement si l'intitulé du poste est entièrement en anglais).
- Rappelle le poste et la date d'envoi de la candidature, puis pose UNE question simple (où en est le processus, y a-t-il une prochaine étape).
- Jamais « je me permets de relancer », « sans nouvelle de votre part » ni reproche : on ne reproche pas l'absence de réponse.
- Aucune invention : sur le candidat, uniquement des faits de son profil ; sur l'entreprise, rien d'autre que son nom. Pas de chiffre, de durée ni de détail de l'offre que tu ne connais pas.
- Pas de flatterie, pas d'adjectifs creux (« passionné », « motivé »), pas de « n'hésitez pas à me contacter ». Texte brut, sans markdown ni liste.`;

export interface RelanceCandidature {
  objet: string;
  corps: string;
}

export async function genererRelanceCandidature(params: {
  profil: Profil;
  titre: string;
  entreprise: string;
  envoyeLe: string;
}): Promise<RelanceCandidature> {
  const { profil, titre, entreprise, envoyeLe } = params;
  const resultat = await anthropic.messages.parse({
    model: MODELE,
    max_tokens: 2048,
    system: SYSTEME,
    messages: [
      {
        role: "user",
        content: `${profilPourPrompt(profil)}

Offre : « ${titre} » chez ${entreprise}
Candidature envoyée le ${envoyeLe}.`,
      },
    ],
    output_config: { format: zodOutputFormat(RelanceSchema) },
  });
  const brut = resultat.parsed_output?.corps;
  if (!brut?.trim()) throw new Error("Impossible de rédiger la relance");

  const corps = tronquer(nettoyerMarkdown(brut), MAX_CORPS);
  const signature = [profil.contact.nom, profil.contact.telephone].filter((l): l is string => Boolean(l)).join("\n");
  return {
    objet: `Candidature — ${titre}`,
    corps: ["Bonjour,", corps, "Cordialement,", signature].filter(Boolean).join("\n\n"),
  };
}
