import type {
  FranceTravailSearchParams,
  FranceTravailSearchResponse,
} from "@/lib/france-travail/types";

const TOKEN_URL =
  "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
const SEARCH_URL =
  "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search";
const SCOPE = "api_offresdemploiv2 o2dsoffre";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const clientId = process.env.FRANCE_TRAVAIL_CLIENT_ID;
  const clientSecret = process.env.FRANCE_TRAVAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "FRANCE_TRAVAIL_CLIENT_ID et FRANCE_TRAVAIL_CLIENT_SECRET doivent être définis dans .env.local",
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: SCOPE,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(
      `Echec de l'authentification France Travail (${res.status}): ${await res.text()}`,
    );
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };

  cachedToken = {
    value: data.access_token,
    // marge de sécurité de 60s avant expiration réelle
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return cachedToken.value;
}

const MAX_TENTATIVES_429 = 3;

function attendre(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function searchOffres(
  params: FranceTravailSearchParams,
): Promise<FranceTravailSearchResponse> {
  const token = await getAccessToken();

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }

  let res: Response;
  let tentative = 0;

  // L'API limite le débit (~3 req/s) : on synchronise beaucoup de requêtes
  // successives (mots-clés × départements), donc un 429 occasionnel est
  // normal — on retente avec un backoff plutôt que d'échouer tout de suite.
  while (true) {
    res = await fetch(`${SEARCH_URL}?${query.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status !== 429 || tentative >= MAX_TENTATIVES_429) break;

    const retryAfter = Number(res.headers.get("retry-after"));
    const delai = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * (tentative + 1);
    await attendre(delai);
    tentative += 1;
  }

  // L'API renvoie 206 (Partial Content) quand la pagination "range" ne
  // couvre pas tous les résultats disponibles, et 204 (No Content, corps
  // vide) quand la recherche ne trouve aucune offre : les deux sont des
  // succès.
  if (!res.ok && res.status !== 206) {
    throw new Error(
      `Echec de la recherche France Travail (${res.status}): ${await res.text()}`,
    );
  }

  if (res.status === 204) {
    return { resultats: [] };
  }

  return (await res.json()) as FranceTravailSearchResponse;
}
