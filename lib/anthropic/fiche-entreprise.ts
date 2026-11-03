import type Anthropic from "@anthropic-ai/sdk";
import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "@/lib/anthropic/client";
import {
  assainirFiche,
  choisirSiteDansResultats,
  extraireObjetJson,
  ficheUtilisable,
  pageMentionne,
  sourcesDepuisBlocs,
  type FicheBrute,
  type SourcesRecherche,
} from "@/lib/prospection/fiche";
import {
  choisirAdresseCandidature,
  lirePagesPubliques,
  telecharger,
  urlPublique,
  type PageLue,
} from "@/lib/prospection/pages-publiques";
import { POSTES_CIBLES } from "@/lib/prospection/secteurs";
import type { Entreprise } from "@/types/prospection";
import type { Fiche } from "@/types/fiche";

// Analyse à bas coût : les pages du site sont lues gratuitement par l'appli
// (voir pages-publiques.ts) et le modèle ne fait que les résumer. Le seul
// appel payant « web » est la recherche du site officiel, et seulement quand
// l'utilisateur ne l'a pas saisi lui-même.
const MODELE = "claude-sonnet-5-5";

const FaitSchema = z.object({
  texte: z.string().describe("Le fait, en une phrase courte et factuelle"),
  source_url: z.string().describe("Lien EXACT de la page qui l'établit, choisi dans la liste fournie"),
});

const FicheSchema = z.object({
  activite: z.string().describe("Ce que fait l'entreprise, en une ou deux phrases"),
  marques: z.array(FaitSchema).describe("Principales marques ou enseignes citées sur les pages"),
  enjeux: z.array(FaitSchema).describe("Enjeux ou orientations stratégiques cités sur les pages (3 maximum)"),
  actualites: z.array(FaitSchema).describe("Actualités, lancements ou chiffres datés cités sur les pages (3 maximum)"),
  contacts_publics: z
    .array(
      z.object({
        nom: z.string(),
        poste: z.string().nullable(),
        email: z.string().nullable().describe("Uniquement si l'adresse figure telle quelle sur les pages, sinon null"),
        source_url: z.string(),
      }),
    )
    .describe("Personnes nommées sur les pages avec un poste en marketing, category, trade marketing, achats, commerce ou RH"),
  postes_suggeres: z
    .array(z.object({ poste: z.string(), raison: z.string() }))
    .describe(
      `Au plus 3 postes à viser, choisis UNIQUEMENT parmi : ${POSTES_CIBLES.join(", ")}. La raison tient en une phrase qui relie un fait précis des pages au poste, sans formule de réserve`,
    ),
});

function descriptionEntreprise(entreprise: Entreprise): string {
  return [
    `Nom (raison sociale Sirene) : ${entreprise.nom}`,
    entreprise.commune && `Siège : ${entreprise.commune}`,
    entreprise.secteur && `Secteur : ${entreprise.secteur}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// Une seule recherche web, pour trouver le site officiel.
export async function trouverSiteOfficiel(entreprise: Entreprise): Promise<string | null> {
  const response = await anthropic.messages.create({
    model: MODELE,
    max_tokens: 2000,
    tools: [
      {
        type: "web_search_20260209",
        name: "web_search",
        max_uses: 1,
        user_location: { type: "approximate", country: "FR", timezone: "Europe/Paris" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Quel est le site officiel de l'enseigne ou du groupe commercial correspondant à cette entreprise ? Le nom est une raison sociale : cherche sous le nom sous lequel le public la connaît (par exemple « Monoprix » pour « MONOPRIX EXPLOITATION »). Ni annuaire, ni réseau social, ni Wikipédia. Fais une recherche web avant de répondre, même si tu crois connaître le site.

${descriptionEntreprise(entreprise)}

Réponds uniquement par l'adresse de la page d'accueil (https://...), sans autre texte.`,
      },
    ],
  });

  const liens: string[] = [];
  for (const block of response.content as Anthropic.ContentBlock[]) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) liens.push(r.url);
    }
  }

  // Le site est choisi parmi les résultats réellement renvoyés : l'adresse que
  // le modèle écrit en réponse est parfois devinée (ex. camparifrance.fr au
  // lieu de campari.com) et n'est donc pas retenue telle quelle.
  const parRecherche = choisirSiteDansResultats(liens, entreprise.nom);
  if (parRecherche) return parRecherche;

  // Sans résultat de recherche (le modèle a répondu de mémoire), l'adresse
  // proposée n'est acceptée que si le site s'ouvre et mentionne l'entreprise.
  const texte = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  for (const candidat of texte.match(/https?:\/\/[^\s)<>"']+/g) ?? []) {
    const url = urlPublique(candidat);
    if (!url) continue;
    const accueil = `${url.protocol}//${url.hostname}/`;
    const html = await telecharger(accueil);
    if (html && pageMentionne(html, entreprise.nom)) return accueil;
  }
  return null;
}

// Schéma de la fiche par recherche web : sans contacts (aucune adresse ne peut y être
// vérifiée mot pour mot sur une page) ; la recherche de contacts passe par Hunter ou la saisie.
const FicheParRechercheSchema = FicheSchema.omit({ contacts_publics: true });

// Quand le site de l'entreprise refuse la lecture automatique (cas fréquent des grands
// groupes), la fiche est établie à partir de quelques recherches web : un appel payant
// (de l'ordre de quelques centimes), limité à 3 recherches. Chaque fait doit citer un lien
// réellement renvoyé par la recherche, comme pour une fiche lue sur le site.
async function genererFicheParRecherche(entreprise: Entreprise, site: string): Promise<Fiche | null> {
  const response = await anthropic.messages.create({
    model: MODELE,
    max_tokens: 6000,
    tools: [
      {
        type: "web_search_20260209",
        name: "web_search",
        max_uses: 3,
        user_location: { type: "approximate", country: "FR", timezone: "Europe/Paris" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Tu prépares la fiche d'une entreprise pour une candidature spontanée. Son site officiel (${site}) refuse la lecture automatique : fais jusqu'à trois recherches web ciblées (activité et marques, enjeux et actualités récents, orientations stratégiques) sur des pages institutionnelles, de presse ou de carrières.

${descriptionEntreprise(entreprise)}

Règles :
- N'écris que ce que les pages trouvées établissent ; omets ce qui n'est pas établi, une liste vide vaut mieux qu'un fait douteux.
- Chaque « source_url » est le lien EXACT d'un résultat que tes recherches ont renvoyé.
- N'écris aucune personne ni adresse e-mail.
- « postes_suggeres » : au plus 3 postes choisis UNIQUEMENT parmi : ${POSTES_CIBLES.join(", ")}, avec une raison d'une phrase liée à un fait précis.

Réponds UNIQUEMENT par un objet JSON de la forme :
{"activite": "...", "marques": [{"texte": "...", "source_url": "..."}], "enjeux": [{"texte": "...", "source_url": "..."}], "actualites": [{"texte": "...", "source_url": "..."}], "postes_suggeres": [{"poste": "...", "raison": "..."}]}`,
      },
    ],
  });

  const blocs = response.content as unknown as Parameters<typeof sourcesDepuisBlocs>[0];
  const texte = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const analyse = FicheParRechercheSchema.safeParse(extraireObjetJson(texte));
  if (!analyse.success) return null;

  const fiche = assainirFiche(
    { ...analyse.data, site_web: site, adresse_candidature: null, contacts_publics: [] },
    sourcesDepuisBlocs(blocs),
  );
  return ficheUtilisable(fiche) ? { ...fiche, lecture: "recherche_web" } : null;
}

function sourcesDepuisPages(pages: PageLue[]): SourcesRecherche {
  return {
    urls: pages.map((p) => p.url),
    // Le texte de chaque page (adresses incluses) sert à confirmer qu'une
    // adresse e-mail y figure vraiment.
    extraits: pages.map((p) => ({ url: p.url, texte: `${p.texte}\n${p.emails.join(" ")}` })),
  };
}

export async function genererFicheEntreprise(entreprise: Entreprise): Promise<Fiche> {
  const site = entreprise.site_web ?? (await trouverSiteOfficiel(entreprise));
  if (!site) {
    throw new Error("Site officiel introuvable : saisis l'adresse du site dans la fiche, puis relance l'analyse");
  }

  const pages = await lirePagesPubliques(site);
  if (pages.length === 0) {
    // Site illisible (souvent une protection anti-robots) : on s'appuie sur la recherche web.
    const parRecherche = await genererFicheParRecherche(entreprise, site).catch((e) => {
      console.error("Fiche par recherche web impossible:", e);
      return null;
    });
    if (parRecherche) return parRecherche;
    throw new Error(
      `Le site ${site} refuse la lecture automatique (ou est trop lent) et la recherche web n'a rien donné d'assez sûr. Essaie une autre adresse (le site du groupe, par exemple), ou ajoute les contacts à la main`,
    );
  }

  const sources = sourcesDepuisPages(pages);
  const corpus = pages.map((p) => `=== ${p.url}\n${p.texte}`).join("\n\n");

  const response = await anthropic.messages.parse({
    model: MODELE,
    max_tokens: 6000,
    system: `Tu résumes les pages publiques d'un site d'entreprise en fiche structurée pour préparer une candidature spontanée. N'utilise que le texte des pages fournies : n'ajoute rien de mémoire, ne complète rien. Chaque « source_url » doit être copiée à l'identique depuis la liste des liens. Un fait que les pages n'établissent pas est omis ; laisse une liste vide plutôt que de remplir.`,
    messages: [
      {
        role: "user",
        content: `Entreprise :
${descriptionEntreprise(entreprise)}

Liens lus (seuls autorisés comme source_url) :
${sources.urls.join("\n")}

Contenu des pages :
${corpus}`,
      },
    ],
    output_config: { format: zodOutputFormat(FicheSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Impossible de structurer la fiche de l'entreprise");
  }

  const brute: FicheBrute = {
    ...response.parsed_output,
    site_web: site,
    // Choisie par le code parmi les adresses réellement présentes sur les
    // pages, pas par le modèle.
    adresse_candidature: choisirAdresseCandidature(pages),
  };

  return assainirFiche(brute, sources);
}
