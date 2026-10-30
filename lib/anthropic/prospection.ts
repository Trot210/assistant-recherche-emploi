import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "@/lib/anthropic/client";
import { nettoyerMarkdown, tronquer, verifierFidelite } from "@/lib/anthropic/documents";
import { assemblerMessage, offrePourProspection, sourceAdresse } from "@/lib/prospection/message";
import { resumerFiche } from "@/lib/prospection/fiche";
import { aujourdhuiParis } from "@/lib/prospection/workflow";
import type { Langue } from "@/types/database.types";
import type { Profil } from "@/types/profil";
import type { ContactEntreprise, Entreprise, Prospection } from "@/types/prospection";

// Les messages spontanés sont courts et nombreux : le modèle Sonnet (moins
// cher que celui des CV et lettres) suffit pour les rédiger et les contrôler.
const MODELE = "claude-sonnet-5-5";

// Un destinataire doit comprendre en cinq secondes : le CV est en pièce jointe,
// le message ne sert qu'à donner envie de l'ouvrir.
const MAX_CORPS_INITIAL = 650;
const MAX_CORPS_RELANCE = 380;
const MAX_OBJET = 70;

const NOM_LANGUE: Record<Langue, string> = { fr: "français", en: "anglais" };

const MessageSchema = z.object({
  objet: z.string().describe(`Objet de l'e-mail, ${MAX_OBJET} caractères maximum, concret : le poste visé, sans majuscules criardes`),
  corps: z
    .string()
    .describe("Cœur du message uniquement : sans formule d'appel, sans formule de politesse finale, sans signature"),
});

function profilPourPrompt(profil: Profil): string {
  return `Date du jour : ${aujourdhuiParis()}.

Profil du candidat (SOURCE UNIQUE ET OFFICIELLE sur le candidat — n'utilise aucune autre information) :
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

function reglesCommunes(langue: Langue): string {
  return `Langue : écris l'objet et le message en ${NOM_LANGUE[langue]}, dans un registre professionnel naturel, comme le ferait un locuteur natif.

Règle absolue — aucune invention :
- Sur le candidat : uniquement des faits présents dans son profil. Pas de durée d'expérience calculée, pas de chiffre, d'outil, de diplôme ou de responsabilité de management absents du profil.
- Sur l'entreprise : uniquement les informations listées sous « Ce que l'on SAIT de l'entreprise ». N'invente aucun produit, lancement, chiffre ni actualité. Sans fiche ni accroche, ne prétends pas connaître l'entreprise de près : reste sur le secteur et le poste visé.

Temps des verbes : une expérience dont la date de fin est antérieure à la date du jour est TERMINÉE et se raconte au passé (« j'ai occupé », « I worked as »), jamais au présent. Le candidat n'est actuellement en poste dans aucune expérience terminée : il est en recherche.

Le CV est joint au message : ne le retranscris pas et ne résume pas le parcours. Pas de liste, pas d'énumération de compétences, pas d'adjectifs creux (« passionné », « motivé », « dynamique »), pas de formule d'excuse ni de remerciement d'avance. Texte brut, sans markdown.`;
}

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
  langue: Langue;
}): Promise<MessageGenere> {
  const { profil, entreprise, contact, posteVise, langue } = params;

  const genere = await rediger(
    `Tu rédiges un e-mail de candidature spontanée très court. Le destinataire doit comprendre en cinq secondes qui écrit, ce qu'il cherche, pourquoi à cette entreprise, et ce qu'il propose.

${reglesCommunes(langue)}

Structure en quatre phrases au plus (une cinquantaine de mots, ${MAX_CORPS_INITIAL} caractères maximum), en un ou deux courts paragraphes :
1. Qui écrit et ce qu'il recherche : le poste visé (ou deux postes voisins, comme Category Management et Trade Marketing), avec au plus une ou deux expériences du profil (employeur et fonction) qui servent directement le propos — pas leur description.
2. Pourquoi cette entreprise : UNE phrase personnalisée qui relie un élément réel de la fiche (une marque, un enjeu ou une actualité) à ce que le candidat sait faire. Sans fiche, une phrase sur le secteur.
3. La démarche : une candidature spontanée, le CV en pièce jointe, et la proposition d'un court échange sur d'éventuelles opportunités.`,
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
    corps: assemblerMessage({
      corps,
      contactNom: nomAPrefixer(contact),
      candidat: profil.contact,
      langue,
      source: sourceAdresse(contact, langue),
    }),
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
  const langue = initial.langue;

  const genere = await rediger(
    `Tu rédiges la relance n°${numero} d'un e-mail de candidature spontanée resté sans réponse.

${reglesCommunes(langue)}

Une relance respecte le temps du destinataire : deux ou trois phrases (${MAX_CORPS_RELANCE} caractères maximum). Rappelle en une phrase le poste visé et le message précédent (envoyé le ${initial.date_envoi ?? "récemment"}), sans en répéter le contenu et sans reprocher l'absence de réponse. Tu peux apporter UN élément nouveau, mais seulement s'il existe dans le profil ou la fiche et n'a pas déjà été mentionné. Termine par une question simple, facile à traiter.`,
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
    corps: assemblerMessage({ corps, contactNom: nomAPrefixer(contact), candidat: profil.contact, langue }),
    avertissements,
  };
}
