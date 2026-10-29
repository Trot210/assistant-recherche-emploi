import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "@/lib/anthropic/client";
import { nettoyerMarkdown, tronquer, verifierFidelite } from "@/lib/anthropic/documents";
import { assemblerMessage, offrePourProspection } from "@/lib/prospection/message";
import type { Profil } from "@/types/profil";
import { resumerFiche } from "@/lib/prospection/fiche";
import type { ContactEntreprise, Entreprise, Prospection } from "@/types/prospection";

// Les messages spontanés sont courts et nombreux : le modèle Sonnet (moins
// cher que celui des CV et lettres) suffit pour les rédiger et les contrôler.
const MODELE = "claude-sonnet-5-5";

const MAX_CORPS_INITIAL = 1000;
const MAX_CORPS_RELANCE = 550;
const MAX_OBJET = 90;

const MessageSchema = z.object({
  objet: z.string().describe(`Objet de l'e-mail, ${MAX_OBJET} caractères maximum, concret, sans majuscules criardes`),
  corps: z
    .string()
    .describe(
      "Cœur du message uniquement : sans formule d'appel, sans formule de politesse finale, sans signature",
    ),
});

function profilPourPrompt(profil: Profil): string {
  return `Profil du candidat (SOURCE UNIQUE ET OFFICIELLE sur le candidat — n'utilise aucune autre information) :
Compétences : ${profil.competences.length > 0 ? profil.competences.join(", ") : "non renseignées"}
Expériences : ${profil.experiences.length > 0 ? JSON.stringify(profil.experiences) : "non renseignées"}
Formation : ${JSON.stringify(profil.formation)}
CV (texte libre complémentaire) : ${profil.cv_texte ?? "non renseigné"}`;
}

// Un contact générique (adresse recrutement@...) n'a pas de nom à saluer.
export function nomAPrefixer(contact: ContactEntreprise | null): string | null {
  return contact && !contact.generique ? contact.nom : null;
}

function entreprisePourPrompt(entreprise: Entreprise, contact: ContactEntreprise | null): string {
  const fiche = resumerFiche(entreprise.fiche);
  return `Ce que l'on SAIT de l'entreprise (SOURCE UNIQUE — n'affirme rien d'autre sur elle) :
Nom : ${entreprise.nom}
Secteur : ${entreprise.secteur ?? "non précisé"}
Implantation : ${entreprise.commune ?? "non précisée"}
${fiche ? `Fiche issue de sources publiques :\n${fiche}\n` : ""}Accroche fournie par le candidat : ${entreprise.notes?.trim() || "aucune"}
Destinataire : ${contact && !contact.generique ? `${contact.nom}${contact.poste ? `, ${contact.poste}` : ""}` : "adresse générique de l'entreprise"}`;
}

const REGLES_COMMUNES = `Règle absolue — aucune invention :
- Sur le candidat : uniquement des faits présents dans son profil. Pas de durée d'expérience calculée, pas de chiffre, d'outil, de diplôme ou de responsabilité de management absents du profil.
- Sur l'entreprise : uniquement les informations listées sous « Ce que l'on SAIT de l'entreprise ». N'invente aucun produit, lancement, chiffre, valeur d'entreprise ni actualité. Quand une fiche est fournie, appuie-toi sur un ou deux de ses éléments (une marque, un enjeu, une actualité) qui rencontrent réellement le profil du candidat, sans les énumérer. Sans fiche ni accroche, ne prétends pas connaître l'entreprise de près : reste sur le secteur et le poste visé.
- Mets en avant les expériences du profil les plus pertinentes pour CE poste dans CETTE entreprise (expérience en enseigne pour un distributeur, côté industriel pour un fabricant).

Ton : direct, professionnel, humain — jamais de formule creuse (« passionné par votre secteur », « profil qui correspond parfaitement »). Chaque phrase apporte un fait ou une demande précise. Texte brut uniquement, sans markdown, sans liste à puces.`;

async function rediger(system: string, user: string) {
  const response = await anthropic.messages.parse({
    model: MODELE,
    // Marge au-delà de la sortie : la réflexion adaptative est décomptée du
    // même budget (voir verifierFidelite).
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: zodOutputFormat(MessageSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Impossible de parser le message généré par Claude");
  }
  return response.parsed_output;
}

export interface MessageGenere {
  objet: string;
  corps: string;
  avertissements: string[];
}

export async function genererMessageSpontane(params: {
  profil: Profil;
  entreprise: Entreprise;
  contact: ContactEntreprise | null;
  posteVise: string;
}): Promise<MessageGenere> {
  const { profil, entreprise, contact, posteVise } = params;

  const genere = await rediger(
    `Tu rédiges un e-mail de candidature spontanée en français, court et personnalisé, pour un candidat qui vise un poste précis dans une entreprise qui n'a publié aucune offre.

${REGLES_COMMUNES}

Structure : (1) une phrase qui dit pourquoi tu écris et quel poste est visé ; (2) deux ou trois faits réels du profil, choisis parce qu'ils servent CE poste dans CE secteur ; (3) une demande claire et modeste (un échange court ou l'orientation vers la bonne personne), et la mention que le CV est en pièce jointe. ${MAX_CORPS_INITIAL} caractères maximum pour le corps.`,
    `${profilPourPrompt(profil)}

${entreprisePourPrompt(entreprise, contact)}

Poste visé : ${posteVise}`,
  );

  const corps = tronquer(nettoyerMarkdown(genere.corps), MAX_CORPS_INITIAL);
  const avertissements = await verifierFidelite(
    profil,
    offrePourProspection(entreprise, posteVise),
    corps,
    "E-mail de candidature spontanée",
    MODELE,
  );

  return {
    objet: tronquer(nettoyerMarkdown(genere.objet), MAX_OBJET),
    corps: assemblerMessage({ corps, contactNom: nomAPrefixer(contact), candidat: profil.contact }),
    avertissements,
  };
}

export async function genererRelance(params: {
  profil: Profil;
  entreprise: Entreprise;
  contact: ContactEntreprise | null;
  initial: Prospection;
  numero: number;
}): Promise<MessageGenere> {
  const { profil, entreprise, contact, initial, numero } = params;

  const genere = await rediger(
    `Tu rédiges la relance n°${numero} d'un e-mail de candidature spontanée resté sans réponse, en français.

${REGLES_COMMUNES}

Une relance respecte le temps du destinataire : trois ou quatre phrases. Rappelle en une phrase le poste visé et le message précédent (envoyé le ${initial.date_envoi ?? "récemment"}), n'en répète pas le contenu, n'accuse pas l'absence de réponse. Tu peux apporter UN élément nouveau, mais seulement s'il existe dans le profil et n'a pas déjà été mentionné. Termine par une question simple et facile à traiter. ${MAX_CORPS_RELANCE} caractères maximum pour le corps.`,
    `${profilPourPrompt(profil)}

${entreprisePourPrompt(entreprise, contact)}

Poste visé : ${initial.poste_vise}

Message précédent (à ne pas recopier) :
${initial.corps}`,
  );

  const corps = tronquer(nettoyerMarkdown(genere.corps), MAX_CORPS_RELANCE);
  const avertissements = await verifierFidelite(
    profil,
    offrePourProspection(entreprise, initial.poste_vise),
    corps,
    "Relance de candidature spontanée",
    MODELE,
  );

  return {
    objet: `Re: ${initial.objet.replace(/^Re:\s*/i, "")}`,
    corps: assemblerMessage({ corps, contactNom: nomAPrefixer(contact), candidat: profil.contact }),
    avertissements,
  };
}
