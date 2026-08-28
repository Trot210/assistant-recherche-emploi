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

export async function searchOffres(
  params: FranceTravailSearchParams,
): Promise<FranceTravailSearchResponse> {
  const token = await getAccessToken();

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }

  const res = await fetch(`${SEARCH_URL}?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // L'API renvoie 206 (Partial Content) quand la pagination "range" ne
  // couvre pas tous les résultats disponibles : c'est un succès.
  if (!res.ok && res.status !== 206) {
    throw new Error(
      `Echec de la recherche France Travail (${res.status}): ${await res.text()}`,
    );
  }

  return (await res.json()) as FranceTravailSearchResponse;
}
