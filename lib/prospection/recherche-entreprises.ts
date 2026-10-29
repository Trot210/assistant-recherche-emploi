import { SECTEURS_CIBLES, tranchesAPartirDe } from "@/lib/prospection/secteurs";

// API publique « Recherche d'entreprises » (data.gouv.fr, base Sirene) :
// gratuite, sans clé, limitée à ~7 requêtes/s. Elle ne fournit ni site web
// ni contact — les contacts sont saisis par l'utilisateur.
const SEARCH_URL = "https://recherche-entreprises.api.gouv.fr/search";

export interface CriteresRecherche {
  secteurId: string;
  departements: string[];
  effectifMin: string;
  motCle?: string;
  page?: number;
}

export interface EntrepriseTrouvee {
  siren: string;
  nom: string;
  code_naf: string | null;
  tranche_effectif: string | null;
  adresse: string | null;
  code_postal: string | null;
  commune: string | null;
  departement: string | null;
}

export interface ResultatRecherche {
  entreprises: EntrepriseTrouvee[];
  total: number;
  page: number;
  totalPages: number;
}

const PAR_PAGE = 25;

export function construireUrlRecherche(criteres: CriteresRecherche): string {
  const secteur = SECTEURS_CIBLES.find((s) => s.id === criteres.secteurId);
  if (!secteur) throw new Error(`Secteur inconnu : ${criteres.secteurId}`);

  const motCle = criteres.motCle?.trim();
  if (secteur.motCleRequis && !motCle) {
    throw new Error("Ce secteur nécessite un mot-clé (nom de groupe ou de marque)");
  }

  const params = new URLSearchParams({
    activite_principale: secteur.codesNaf.join(","),
    etat_administratif: "A",
    per_page: String(PAR_PAGE),
    page: String(criteres.page ?? 1),
  });

  if (criteres.departements.length > 0) {
    params.set("departement", criteres.departements.join(","));
  }

  const tranches = tranchesAPartirDe(criteres.effectifMin);
  if (tranches.length > 0) {
    params.set("tranche_effectif_salarie", tranches.join(","));
  }

  if (motCle) params.set("q", motCle);

  return `${SEARCH_URL}?${params.toString()}`;
}

interface ReponseApi {
  results?: {
    siren: string;
    nom_complet?: string;
    nom_raison_sociale?: string;
    activite_principale?: string;
    tranche_effectif_salarie?: string | null;
    siege?: {
      adresse?: string;
      code_postal?: string;
      libelle_commune?: string;
      departement?: string;
      tranche_effectif_salarie?: string | null;
    };
  }[];
  total_results?: number;
  page?: number;
  total_pages?: number;
}

// "NN" = effectif non renseigné chez l'INSEE : on le stocke comme absent
// plutôt que comme une vraie tranche.
function trancheOuNull(code: string | null | undefined): string | null {
  return code && code !== "NN" ? code : null;
}

export function normaliserReponse(reponse: ReponseApi): ResultatRecherche {
  const entreprises = (reponse.results ?? []).map((r) => ({
    siren: r.siren,
    nom: r.nom_complet ?? r.nom_raison_sociale ?? r.siren,
    code_naf: r.activite_principale ?? null,
    tranche_effectif: trancheOuNull(r.tranche_effectif_salarie ?? r.siege?.tranche_effectif_salarie),
    adresse: r.siege?.adresse ?? null,
    code_postal: r.siege?.code_postal ?? null,
    commune: r.siege?.libelle_commune ?? null,
    departement: r.siege?.departement ?? null,
  }));

  return {
    entreprises,
    total: reponse.total_results ?? entreprises.length,
    page: reponse.page ?? 1,
    totalPages: reponse.total_pages ?? 1,
  };
}

export async function rechercherEntreprises(criteres: CriteresRecherche): Promise<ResultatRecherche> {
  const res = await fetch(construireUrlRecherche(criteres), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Recherche d'entreprises indisponible (${res.status})`);
  }

  return normaliserReponse((await res.json()) as ReponseApi);
}
