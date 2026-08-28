import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "@/lib/anthropic/client";
import type { Profil } from "@/types/profil";
import type { Offre } from "@/types/offre";

// Bornes strictes pour garantir un CV tenant sur une seule page A4, quoi
// que renvoie le modèle : appliquées à la fois dans le prompt et en dur
// après coup, en défense en profondeur.
const MAX_ACCROCHE_CHARS = 480;
const MAX_COMPETENCES = 10;
const MAX_POINTS_PAR_EXPERIENCE = 5;
const MAX_POINT_CHARS = 135;
const MAX_MESSAGE_CHARS = 1800;

function tronquer(texte: string, max: number) {
  return texte.length <= max ? texte : `${texte.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

function formaterPeriode(dateDebut: string, dateFin: string | null): string {
  const formaterDate = (d: string) => {
    const [annee, mois] = d.split("-");
    return mois ? `${mois}/${annee}` : annee;
  };
  return `${formaterDate(dateDebut)} - ${dateFin ? formaterDate(dateFin) : "En cours"}`;
}

// --- CV -----------------------------------------------------------------

// Claude ne reçoit JAMAIS la responsabilité de reproduire poste/entreprise/
// dates : ces champs sont copiés tels quels depuis le profil en base, pour
// une garantie structurelle (pas seulement une consigne de prompt) qu'ils
// ne peuvent pas être altérés ou inventés.
const CVGenereSchema = z.object({
  accroche: z
    .string()
    .describe(
      `Paragraphe de profil en tête de CV (2-3 phrases MAXIMUM, ${MAX_ACCROCHE_CHARS} caractères maximum), positionnant le candidat par rapport à cette offre précise`,
    ),
  competences_mises_en_avant: z
    .array(z.string())
    .describe(
      `${MAX_COMPETENCES} compétences maximum du profil, courtes (2-4 mots), sélectionnées pour matcher cette offre, par ordre de pertinence`,
    ),
  experiences: z
    .array(
      z.object({
        points: z
          .array(z.string())
          .describe(
            `${MAX_POINTS_PAR_EXPERIENCE} points MAXIMUM, sélectionnés/reformulés UNIQUEMENT à partir des points réels de cette expérience, les plus pertinents pour cette offre`,
          ),
      }),
    )
    .describe(
      "Exactement un élément par expérience du profil, dans le même ordre, sans en omettre aucune",
    ),
});

export interface CVExperience {
  poste: string;
  entreprise: string;
  lieu?: string;
  periode: string;
  points: string[];
}

export interface CVContent {
  accroche: string;
  competences_mises_en_avant: string[];
  experiences: CVExperience[];
}

function contexte(profil: Profil, offre: Offre): string {
  return `Profil du candidat (SOURCE UNIQUE ET OFFICIELLE — n'utilise aucune autre information) :
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

export async function genererContenuCV(
  profil: Profil,
  offre: Offre,
): Promise<{ contenu: CVContent; avertissements: string[] }> {
  const response = await anthropic.messages.parse({
    model: "claude-opus-5",
    max_tokens: 4096,
    system: `Tu adaptes le CV d'un candidat pour une offre d'emploi précise, au format d'un CV finance/conseil : dense, factuel, sans blabla.

Règle absolue — aucune invention : le profil fourni est la source unique et officielle. Tu ne dois jamais créer, deviner ou supposer une expérience, un poste, une entreprise, un diplôme, une compétence, un outil, un chiffre, une langue ou un niveau qui n'apparaît pas explicitement dans ce profil. Tu peux reformuler, synthétiser et réorganiser les informations existantes, mais jamais en ajouter de nouvelles.

Optimisation ATS : intègre naturellement les mots-clés importants de l'offre dans les points sélectionnés, mais UNIQUEMENT lorsqu'ils correspondent réellement à une expérience ou compétence du candidat — jamais artificiellement.

Contrainte de format : le CV final doit tenir sur UNE SEULE page A4.
- Un élément de sortie par expérience du profil, dans le même ordre, sans en omettre aucune.
- Pour chaque expérience, sélectionne au maximum ${MAX_POINTS_PAR_EXPERIENCE} points parmi les points réels fournis dans sous_sections — les plus pertinents pour CETTE offre. Chaque point tient sur une phrase courte et dense.
- Le paragraphe d'accroche fait 2-3 phrases maximum.
- Maximum ${MAX_COMPETENCES} compétences mises en avant, formulées en 2-4 mots chacune, choisies parmi les compétences réelles du profil.`,
    messages: [{ role: "user", content: contexte(profil, offre) }],
    output_config: {
      format: zodOutputFormat(CVGenereSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error("Impossible de parser le contenu du CV généré par Claude");
  }

  const genere = response.parsed_output;

  // Les métadonnées d'expérience (poste/entreprise/lieu/dates) viennent
  // directement du profil, jamais du modèle — voir le commentaire sur
  // CVGenereSchema plus haut.
  const experiences: CVExperience[] = profil.experiences.map((exp, i) => ({
    poste: exp.poste,
    entreprise: exp.entreprise,
    lieu: exp.lieu,
    periode: formaterPeriode(exp.date_debut, exp.date_fin),
    points: (genere.experiences[i]?.points ?? [])
      .slice(0, MAX_POINTS_PAR_EXPERIENCE)
      .map((p) => tronquer(p, MAX_POINT_CHARS)),
  }));

  const contenu: CVContent = {
    accroche: tronquer(genere.accroche, MAX_ACCROCHE_CHARS),
    competences_mises_en_avant: genere.competences_mises_en_avant.slice(0, MAX_COMPETENCES),
    experiences,
  };

  const avertissements = await verifierFidelite(
    profil,
    JSON.stringify({
      accroche: contenu.accroche,
      competences: contenu.competences_mises_en_avant,
      points: contenu.experiences.flatMap((e) => e.points),
    }),
    "CV adapté",
  );

  return { contenu, avertissements };
}

// --- Lettre de motivation -------------------------------------------------

export async function genererLettreMotivation(
  profil: Profil,
  offre: Offre,
): Promise<{ texte: string; avertissements: string[] }> {
  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 4096,
    system: `Tu rédiges une lettre de motivation en français, professionnelle et personnalisée, à partir du profil réel d'un candidat et d'une offre d'emploi précise.

Règle absolue — aucune invention : le profil fourni est la source unique et officielle. N'invente jamais une expérience, un poste, une entreprise, un chiffre ou une compétence absente du profil. Les noms d'entreprises, intitulés de poste et dates doivent rester strictement identiques à ceux du profil.

La lettre doit démontrer une compréhension concrète de l'entreprise et du poste (à partir de la description fournie), expliquer le lien entre le parcours réel du candidat et les besoins de l'offre, et mettre en avant ce qu'il peut concrètement apporter. Évite les formules génériques et les phrases qui pourraient être envoyées à n'importe quelle entreprise. Registre factuel et dense, cohérent avec un CV structuré.

Contrainte impérative : la lettre doit remplir une page A4 sans déborder sur une deuxième — vise 420-480 mots répartis sur 5 paragraphes développés (pas de phrases trop courtes ni de liste à puces). Réponds uniquement avec le texte de la lettre, sans commentaire ni balisage, sans en-tête ni formule d'adresse (le nom et les coordonnées du candidat sont ajoutés séparément).`,
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

  const avertissements = await verifierFidelite(profil, texte, "Lettre de motivation");

  return { texte, avertissements };
}

// --- Message de motivation court (formulaires en ligne) -------------------

export async function genererMessageMotivation(
  profil: Profil,
  offre: Offre,
): Promise<{ texte: string; avertissements: string[] }> {
  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    // Marge au-delà des ~1800 caractères visés : Claude Opus 5 réfléchit
    // par défaut et ces tokens sont décomptés du même budget.
    max_tokens: 2048,
    system: `Tu rédiges un message de motivation court en français, à partir du profil réel d'un candidat et d'une offre d'emploi précise. C'est une version condensée de sa candidature, destinée à être collée directement dans un formulaire de candidature en ligne ou envoyée à un recruteur.

Règle absolue — aucune invention : le profil fourni est la source unique et officielle. N'invente jamais une expérience, un poste, une entreprise, un chiffre ou une compétence absente du profil.

Contrainte impérative : ${MAX_MESSAGE_CHARS} caractères MAXIMUM, espaces compris. Percutant, personnalisé au poste et à l'entreprise, met en avant rapidement les éléments les plus pertinents du profil. Prêt à être copié-collé tel quel : pas de titre, pas de formule d'objet, pas de balisage.`,
    messages: [{ role: "user", content: contexte(profil, offre) }],
  });

  const texte = response.content
    .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!texte) {
    throw new Error("Claude n'a renvoyé aucun texte pour le message de motivation");
  }

  const texteBorne = tronquer(texte, MAX_MESSAGE_CHARS);
  const avertissements = await verifierFidelite(profil, texteBorne, "Message de motivation court");

  return { texte: texteBorne, avertissements };
}

// --- Contrôle qualité : vérification de fidélité au profil ----------------

const VerificationSchema = z.object({
  fidele: z.boolean().describe("true si le texte ne contient aucune information absente du profil"),
  avertissements: z
    .array(z.string())
    .describe("Liste des affirmations potentiellement inventées ou non vérifiables ; vide si aucune"),
});

async function verifierFidelite(
  profil: Profil,
  texteAVerifier: string,
  contexteDocument: string,
): Promise<string[]> {
  const response = await anthropic.messages.parse({
    model: "claude-opus-5",
    // Claude Opus 5 réfléchit par défaut (adaptive thinking) et ces tokens
    // de réflexion sont décomptés du même budget que la réponse JSON — à
    // 1024 la sortie structurée se faisait tronquer en plein milieu d'une
    // chaîne (erreur "Unterminated string in JSON").
    max_tokens: 4096,
    system:
      "Tu es un contrôleur qualité strict pour des candidatures d'emploi. On te donne le profil RÉEL d'un candidat et un texte généré pour sa candidature. Vérifie que CHAQUE affirmation factuelle du texte (expérience, poste, entreprise, compétence, outil, chiffre, diplôme, langue, niveau) est bien présente ou directement déductible du profil fourni — sans invention, exagération ni supposition. Signale toute affirmation non vérifiable, même mineure. Une reformulation ou synthèse fidèle n'est PAS un problème ; seule une information nouvelle en est un.",
    messages: [
      {
        role: "user",
        content: `Profil réel du candidat :
Compétences : ${profil.competences.join(", ")}
Expériences : ${JSON.stringify(profil.experiences)}
Formation : ${JSON.stringify(profil.formation)}
Contact/langues/outils : ${JSON.stringify(profil.contact)}

Document généré à vérifier (${contexteDocument}) :
${texteAVerifier}`,
      },
    ],
    output_config: { format: zodOutputFormat(VerificationSchema) },
  });

  if (!response.parsed_output || response.parsed_output.fidele) {
    return [];
  }

  return response.parsed_output.avertissements;
}
