export interface SecteurCible {
  id: string;
  libelle: string;
  // Codes NAF (rév. 2) transmis tels quels à l'API Recherche d'entreprises.
  codesNaf: string[];
  // Les sièges de grands groupes (Danone, L'Oréal...) sont souvent classés
  // 70.10Z "activités des sièges sociaux" sans lien avec leur métier : sans
  // mot-clé, cette recherche remonterait n'importe quel siège.
  motCleRequis?: boolean;
}

export const SECTEURS_CIBLES: SecteurCible[] = [
  {
    id: "agroalimentaire",
    libelle: "Agroalimentaire",
    codesNaf: [
      "10.11Z", "10.12Z", "10.13A", "10.13B", "10.20Z", "10.31Z", "10.32Z", "10.39A", "10.39B",
      "10.41A", "10.41B", "10.42Z", "10.51A", "10.51B", "10.51C", "10.51D", "10.52Z", "10.61A",
      "10.61B", "10.62Z", "10.71A", "10.71B", "10.71C", "10.71D", "10.72Z", "10.73Z", "10.81Z",
      "10.82Z", "10.83Z", "10.84Z", "10.85Z", "10.86Z", "10.89Z", "10.91Z", "10.92Z",
    ],
  },
  {
    id: "boissons",
    libelle: "Boissons et spiritueux",
    codesNaf: [
      "11.01Z", "11.02A", "11.02B", "11.03Z", "11.04Z", "11.05Z", "11.06Z", "11.07A", "11.07B",
    ],
  },
  {
    id: "beaute-hygiene",
    libelle: "Beauté, hygiène et entretien",
    codesNaf: ["20.41Z", "20.42Z", "46.44Z", "46.45Z", "47.75Z"],
  },
  {
    id: "gros-alimentaire",
    libelle: "Négoce et grossistes alimentaires",
    codesNaf: [
      "46.31Z", "46.32A", "46.32B", "46.32C", "46.33Z", "46.34Z", "46.36Z", "46.37Z", "46.38A",
      "46.38B", "46.39A", "46.39B",
    ],
  },
  {
    id: "gms",
    libelle: "Grande distribution (GMS)",
    codesNaf: ["47.11B", "47.11C", "47.11D", "47.11E", "47.11F", "47.19A"],
  },
  {
    id: "distribution-specialisee",
    libelle: "Distribution spécialisée",
    codesNaf: ["47.52B", "47.54Z", "47.64Z", "47.74Z"],
  },
  {
    id: "ecommerce",
    libelle: "E-commerce et marketplaces",
    codesNaf: ["47.91A", "47.91B", "63.12Z"],
  },
  {
    id: "conseil-retail",
    libelle: "Conseil, études et marketing retail",
    codesNaf: ["70.22Z", "73.11Z", "73.20Z"],
  },
  {
    id: "sieges",
    libelle: "Sièges de groupes (mot-clé requis)",
    codesNaf: ["70.10Z"],
    motCleRequis: true,
  },
];

export const POSTES_CIBLES = [
  "Category Manager",
  "Trade Marketing",
  "Chef de Produit",
  "Acheteur",
  "Business Developer",
  "Key Account Manager",
  "Consultant",
] as const;

export interface ZoneGeographique {
  id: string;
  libelle: string;
  departements: string[];
}

export const ZONES: ZoneGeographique[] = [
  { id: "proche", libelle: "Proche Saint-Ouen (75, 92, 93)", departements: ["75", "92", "93"] },
  {
    id: "idf",
    libelle: "Île-de-France",
    departements: ["75", "77", "78", "91", "92", "93", "94", "95"],
  },
];

// Codes de tranche d'effectif de l'INSEE, du plus petit au plus grand ("NN"
// = non renseigné, traité comme inconnu et non comme zéro salarié).
const TRANCHES_ORDRE = [
  "00", "01", "02", "03", "11", "12", "21", "22", "31", "32", "41", "42", "51", "52", "53",
] as const;

const LIBELLES_TRANCHE: Record<string, string> = {
  NN: "Effectif inconnu",
  "00": "0 salarié",
  "01": "1-2 salariés",
  "02": "3-5 salariés",
  "03": "6-9 salariés",
  "11": "10-19 salariés",
  "12": "20-49 salariés",
  "21": "50-99 salariés",
  "22": "100-199 salariés",
  "31": "200-249 salariés",
  "32": "250-499 salariés",
  "41": "500-999 salariés",
  "42": "1 000-1 999 salariés",
  "51": "2 000-4 999 salariés",
  "52": "5 000-9 999 salariés",
  "53": "10 000 salariés et plus",
};

export function libelleTranche(code: string | null | undefined): string {
  if (!code) return LIBELLES_TRANCHE.NN;
  return LIBELLES_TRANCHE[code] ?? LIBELLES_TRANCHE.NN;
}

// Toutes les tranches d'effectif à partir du seuil choisi (inclus).
export function tranchesAPartirDe(seuil: string): string[] {
  const index = TRANCHES_ORDRE.indexOf(seuil as (typeof TRANCHES_ORDRE)[number]);
  return index === -1 ? [] : TRANCHES_ORDRE.slice(index);
}

export const SEUILS_EFFECTIF = [
  { code: "12", libelle: "20 salariés et plus" },
  { code: "21", libelle: "50 salariés et plus" },
  { code: "22", libelle: "100 salariés et plus" },
  { code: "32", libelle: "250 salariés et plus" },
];
