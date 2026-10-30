// Tarifs publics de l'API Claude, en dollars par million de jetons (entrée,
// sortie). Les jetons lus dans le cache coûtent 10 % du prix d'entrée, ceux
// écrits dans le cache 125 %. Une recherche web facturée à part vaut 10 $ les
// 1 000 recherches. Ces montants servent à ESTIMER la dépense : la facture
// officielle reste celle de la console Anthropic.
const TARIFS_PAR_MODELE: Record<string, { entree: number; sortie: number }> = {
  "claude-sonnet-5-5": { entree: 2, sortie: 10 },
  "claude-sonnet-5": { entree: 2, sortie: 10 },
  "claude-opus-5-5": { entree: 4, sortie: 20 },
  "claude-opus-5": { entree: 5, sortie: 25 },
  "claude-haiku-5-5": { entree: 0.1, sortie: 0.5 },
};

// Modèle inconnu : on retient le tarif le plus élevé, pour ne jamais sous-estimer.
const TARIF_PAR_DEFAUT = { entree: 5, sortie: 25 };
const COUT_RECHERCHE_WEB_USD = 0.01;

export interface UsageApi {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
}

export interface UsageMesure {
  tokensEntree: number;
  tokensSortie: number;
  tokensCacheLecture: number;
  tokensCacheEcriture: number;
  recherchesWeb: number;
}

export function mesurerUsage(usage: UsageApi | null | undefined): UsageMesure {
  return {
    tokensEntree: usage?.input_tokens ?? 0,
    tokensSortie: usage?.output_tokens ?? 0,
    tokensCacheLecture: usage?.cache_read_input_tokens ?? 0,
    tokensCacheEcriture: usage?.cache_creation_input_tokens ?? 0,
    recherchesWeb: usage?.server_tool_use?.web_search_requests ?? 0,
  };
}

export function coutEstimeUsd(modele: string, usage: UsageMesure): number {
  const tarif = TARIFS_PAR_MODELE[modele] ?? TARIF_PAR_DEFAUT;
  const parJeton = (prix: number) => prix / 1_000_000;
  const cout =
    usage.tokensEntree * parJeton(tarif.entree) +
    usage.tokensSortie * parJeton(tarif.sortie) +
    usage.tokensCacheLecture * parJeton(tarif.entree * 0.1) +
    usage.tokensCacheEcriture * parJeton(tarif.entree * 1.25) +
    usage.recherchesWeb * COUT_RECHERCHE_WEB_USD;
  return Math.round(cout * 100_000) / 100_000;
}

// Premier jour du mois courant à Paris, en ISO UTC : borne basse du total mensuel.
export function debutMoisParis(maintenant: Date): string {
  const [annee, mois] = maintenant
    .toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" })
    .split("-")
    .map(Number);
  // Minuit à Paris = 22 h ou 23 h UTC la veille ; une heure de marge suffit pour ce total indicatif.
  return new Date(Date.UTC(annee, mois - 1, 1) - 2 * 3_600_000).toISOString();
}

export function formaterUsd(montant: number): string {
  return `${montant.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: montant < 1 ? 3 : 2 })} $`;
}
