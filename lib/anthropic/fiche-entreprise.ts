import type Anthropic from "@anthropic-ai/sdk";
import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "@/lib/anthropic/client";
import { assainirFiche, extraireDomaine, type FicheBrute, type SourcesRecherche } from "@/lib/prospection/fiche";
import {
  choisirAdresseCandidature,
  lirePagesPubliques,
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

// Une seule recherche web, pour trouver le site officiel. Le lien retenu doit
// figurer parmi les résultats réellement renvoyés par la recherche : un site
// inventé par le modèle est refusé.
export async function trouverSiteOfficiel(entreprise: Entreprise): Promise<string | null> {
  const response = await anthropic.messages.create({
    model: MODELE,
    max_tokens: 1500,
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
        content: `Quel est le site officiel de l'enseigne ou du groupe commercial correspondant à cette entreprise ? Le nom est une raison sociale : cherche sous le nom sous lequel le public la connaît (par exemple « Monoprix » pour « MONOPRIX EXPLOITATION »). Ni annuaire, ni réseau social, ni Wikipédia.

${descriptionEntreprise(entreprise)}

Réponds uniquement par l'adresse de la page d'accueil (https://...), sans autre texte.`,
      },
    ],
  });

  const resultats = new Set<string>();
  let texte = "";
  for (const block of response.content as Anthropic.ContentBlock[]) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) {
        const domaine = extraireDomaine(r.url);
        if (domaine) resultats.add(domaine);
      }
    }
    if (block.type === "text") texte += `${block.text}\n`;
  }

  for (const candidat of texte.match(/https?:\/\/[^\s)<>"']+/g) ?? []) {
    const url = urlPublique(candidat);
    const domaine = extraireDomaine(candidat);
    if (url && domaine && resultats.has(domaine)) return `${url.protocol}//${url.hostname}/`;
  }
  return null;
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
    throw new Error(
      `Le site ${site} n'a pas pu être lu (accès refusé ou trop lent). Vérifie l'adresse dans la fiche, ou ajoute les contacts à la main`,
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
