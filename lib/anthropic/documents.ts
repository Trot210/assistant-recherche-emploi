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
const MAX_POINTS_PAR_SOUS_SECTION = 3;
const MAX_POINT_CHARS = 135;
const MAX_MESSAGE_CHARS = 1800;

// Claude respecte généralement la consigne "texte brut, sans balisage", mais
// glisse parfois du markdown (gras, titres) qui s'affiche tel quel — en
// astérisques littéraux — dans le PDF. Filet de sécurité plutôt que de
// compter uniquement sur le prompt.
function nettoyerMarkdown(texte: string): string {
  return texte
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(?<!\w)\*(\S(?:.*?\S)?)\*(?!\w)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`/g, "")
    .trim();
}

// Coupe sur la dernière phrase complète si elle tombe raisonnablement près
// de la limite (ex: "...KPI et NielsenIQ." plutôt que "...environnements
// hétérogènes et…") ; sinon retombe sur une coupure au dernier mot entier,
// avec ellipse.
export function tronquer(texte: string, max: number) {
  if (texte.length <= max) return texte;
  const coupe = texte.slice(0, max);
  const dernierePhrase = Math.max(
    coupe.lastIndexOf(". "),
    coupe.lastIndexOf("! "),
    coupe.lastIndexOf("? "),
  );
  if (dernierePhrase > max * 0.6) {
    return coupe.slice(0, dernierePhrase + 1);
  }
  return `${coupe.replace(/\s+\S*$/, "")}…`;
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
        sous_sections: z
          .array(
            z.object({
              points: z
                .array(z.string())
                .describe(
                  `${MAX_POINTS_PAR_SOUS_SECTION} points MAXIMUM, sélectionnés/reformulés UNIQUEMENT à partir des points réels de cette sous-section, les plus pertinents pour cette offre`,
                ),
            }),
          )
          .describe(
            "Exactement un élément par sous-section de cette expérience, dans le même ordre, sans en omettre aucune",
          ),
      }),
    )
    .describe(
      "Exactement un élément par expérience du profil, dans le même ordre, sans en omettre aucune",
    ),
});

export interface CVSousSection {
  titre: string;
  points: string[];
}

export interface CVExperience {
  poste: string;
  entreprise: string;
  lieu?: string;
  periode: string;
  sousSections: CVSousSection[];
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

Règle absolue — aucune invention : le profil fourni est la source unique et officielle. Tu ne dois jamais créer, deviner ou supposer une expérience, un poste, une entreprise, un diplôme, une compétence, un outil, un chiffre, une langue ou un niveau qui n'apparaît pas explicitement dans ce profil. Cela inclut les durées d'expérience calculées ou estimées (ex: additionner des périodes pour dire "X années d'expérience") et toute responsabilité de management/encadrement d'équipe non explicitement mentionnée. Tu peux reformuler, synthétiser et réorganiser les informations existantes, mais jamais en ajouter de nouvelles ni en déduire de nouvelles par calcul ou inférence.

Optimisation ATS : intègre naturellement les mots-clés importants de l'offre dans les points sélectionnés, mais UNIQUEMENT lorsqu'ils correspondent réellement à une expérience ou compétence du candidat — jamais artificiellement.

Contrainte de format : le CV final doit tenir sur UNE SEULE page A4. Réponds en texte brut uniquement — jamais de markdown (pas d'astérisques, pas de dièses, pas de balisage).
- Un élément de sortie par expérience du profil, dans le même ordre, sans en omettre aucune.
- Pour chaque expérience, un élément de sortie par sous-section (sous_sections), dans le même ordre, sans en omettre aucune — reprends la structure du profil, ne fusionne pas les sous-sections entre elles.
- Pour chaque sous-section, sélectionne au maximum ${MAX_POINTS_PAR_SOUS_SECTION} points parmi ses points réels — les plus pertinents pour CETTE offre. Chaque point tient sur une phrase courte et dense (une ligne).
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
    // Le titre de chaque sous-section vient du profil, jamais du modèle —
    // même garantie structurelle que poste/entreprise/dates ci-dessus.
    sousSections: exp.sous_sections.map((sousSection, j) => ({
      titre: sousSection.titre,
      points: (genere.experiences[i]?.sous_sections[j]?.points ?? [])
        .slice(0, MAX_POINTS_PAR_SOUS_SECTION)
        .map((p) => tronquer(nettoyerMarkdown(p), MAX_POINT_CHARS)),
    })),
  }));

  const contenu: CVContent = {
    accroche: tronquer(nettoyerMarkdown(genere.accroche), MAX_ACCROCHE_CHARS),
    competences_mises_en_avant: genere.competences_mises_en_avant
      .slice(0, MAX_COMPETENCES)
      .map((c) => nettoyerMarkdown(c)),
    experiences,
  };

  const avertissements = await verifierFidelite(
    profil,
    offre,
    JSON.stringify({
      accroche: contenu.accroche,
      competences: contenu.competences_mises_en_avant,
      points: contenu.experiences.flatMap((e) => e.sousSections.flatMap((ss) => ss.points)),
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

Règle absolue — aucune invention : le profil fourni est la source unique et officielle. N'invente jamais une expérience, un poste, une entreprise, un chiffre ou une compétence absente du profil. Les noms d'entreprises, intitulés de poste et dates doivent rester strictement identiques à ceux du profil. N'additionne et n'estime jamais une durée d'expérience globale (ex: "je travaille sur ces sujets depuis X ans") si ce chiffre n'apparaît pas tel quel dans le profil, et n'attribue jamais de responsabilité de management/encadrement d'équipe non explicitement mentionnée.

La lettre doit démontrer une compréhension concrète de l'entreprise et du poste (à partir de la description fournie), expliquer le lien entre le parcours réel du candidat et les besoins de l'offre, et mettre en avant ce qu'il peut concrètement apporter.

Interdiction stricte des formules creuses et génériques — proscris notamment "je suis convaincu(e) que mon profil correspond parfaitement à vos attentes", "passionné(e) par votre secteur d'activité", "fort de mon expérience" sans fait concret immédiatement après, ou toute phrase de motivation qui ne dit pas pourquoi CETTE entreprise précisément. Chaque affirmation doit s'appuyer sur un fait réel du profil ou un élément précis de la description de l'offre — jamais une généralité qui pourrait s'appliquer à n'importe quel candidat ou n'importe quelle entreprise. Registre factuel et dense, cohérent avec un CV structuré.

Structure attendue : commence par "Madame, Monsieur," sur sa propre ligne (seule sur son paragraphe), puis 3-4 paragraphes développés, puis une formule de politesse de clôture suivie du prénom et nom du candidat sur sa propre ligne.

Contrainte impérative : la lettre doit remplir une page A4 sans déborder sur une deuxième — vise 420-480 mots au total (hors salutation d'ouverture et de clôture), répartis sur les paragraphes développés (pas de phrases trop courtes ni de liste à puces). Réponds en texte brut uniquement — jamais de markdown (pas d'astérisques, pas de dièses, pas de balisage) —, sans commentaire, sans bloc d'adresse en en-tête (le nom et les coordonnées du candidat figurent déjà séparément en haut du document).`,
    messages: [{ role: "user", content: contexte(profil, offre) }],
  });

  const texteBrut = response.content
    .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!texteBrut) {
    throw new Error("Claude n'a renvoyé aucun texte pour la lettre de motivation");
  }

  const texte = nettoyerMarkdown(texteBrut);

  const avertissements = await verifierFidelite(profil, offre, texte, "Lettre de motivation");

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

Règle absolue — aucune invention : le profil fourni est la source unique et officielle. N'invente jamais une expérience, un poste, une entreprise, un chiffre ou une compétence absente du profil. N'additionne et n'estime jamais une durée d'expérience globale non présente telle quelle dans le profil, et n'attribue jamais de responsabilité de management/encadrement d'équipe non explicitement mentionnée.

Contrainte impérative : ${MAX_MESSAGE_CHARS} caractères MAXIMUM, espaces compris. Percutant, personnalisé au poste et à l'entreprise, met en avant rapidement les éléments les plus pertinents du profil. Prêt à être copié-collé tel quel : pas de titre, pas de formule d'objet, texte brut uniquement — jamais de markdown (pas d'astérisques, pas de dièses, pas de balisage).`,
    messages: [{ role: "user", content: contexte(profil, offre) }],
  });

  const texteBrut = response.content
    .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!texteBrut) {
    throw new Error("Claude n'a renvoyé aucun texte pour le message de motivation");
  }

  const texteBorne = tronquer(nettoyerMarkdown(texteBrut), MAX_MESSAGE_CHARS);
  const avertissements = await verifierFidelite(profil, offre, texteBorne, "Message de motivation court");

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
  offre: Offre,
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
    system: `Tu es un contrôleur qualité strict pour des candidatures d'emploi. On te donne le profil RÉEL d'un candidat, l'offre d'emploi ciblée, et un texte généré pour cette candidature.

Deux catégories d'affirmations, deux sources de vérité distinctes :
- Affirmations sur le CANDIDAT (expérience, poste, entreprise, compétence, outil, chiffre, diplôme, langue, niveau, durée, responsabilité de management...) : doivent être présentes ou directement déductibles du PROFIL fourni. Signale toute durée d'expérience calculée/estimée, toute compétence de management ou tout fait qui ne figure pas explicitement, tel quel, dans le profil — même s'il semble raisonnable.
- Affirmations sur l'ENTREPRISE ou le POSTE visé (nom, secteur, produits, taille, siège, positionnement marché...) : doivent être présentes ou directement déductibles de l'OFFRE D'EMPLOI fournie. Ne les signale PAS si elles sont cohérentes avec l'offre, même absentes du profil du candidat — ce n'est pas le rôle de ce contrôle. Signale-les seulement si elles ne sont déductibles ni de l'offre ni de connaissances publiques évidentes sur l'entreprise nommée dans l'offre.

Signale toute affirmation sur le candidat non vérifiable, même mineure. Une reformulation ou synthèse fidèle n'est PAS un problème ; seule une information nouvelle sur le candidat en est un.`,
    messages: [
      {
        role: "user",
        content: `Profil réel du candidat :
Compétences : ${profil.competences.join(", ")}
Expériences : ${JSON.stringify(profil.experiences)}
Formation : ${JSON.stringify(profil.formation)}
Contact/langues/outils : ${JSON.stringify(profil.contact)}

Offre d'emploi ciblée :
Titre : ${offre.titre}
Entreprise : ${offre.entreprise ?? "non renseignée"}
Description : ${offre.description ?? "non renseignée"}

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
