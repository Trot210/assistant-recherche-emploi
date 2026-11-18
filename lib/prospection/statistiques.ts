// Statistiques simples de la recherche, calculées sur les données déjà en base (aucun appel à Claude) :
// ce qui part, ce qui revient, et en combien de temps. Calcul pur.

export interface ProspectionStat {
  type: string;
  date_envoi: string | null;
  reponse_date: string | null;
  reponse_type: string | null;
}

export interface CandidatureStat {
  statut: string;
  date_envoi: string | null;
}

export interface CourrierStat {
  nature: string;
  date_mail: string | null;
}

export interface SemaineStat {
  // Lundi de la semaine (AAAA-MM-JJ).
  debut: string;
  envois: number;
  accuses: number;
  refus: number;
  entretiens: number;
}

export interface Statistiques {
  semaines: SemaineStat[];
  spontanees: { envoyees: number; reponses: number; tauxReponse: number | null; delaiMoyenJours: number | null };
  offres: { envoyees: number };
  total: { envois: number; accuses: number; refus: number; entretiens: number };
}

function jour(date: string): Date {
  return new Date(`${date.slice(0, 10)}T12:00:00Z`);
}

// Lundi de la semaine qui contient `date` (les semaines vont du lundi au dimanche).
export function lundiDeLaSemaine(date: string): string {
  const d = jour(date);
  const decalage = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - decalage);
  return d.toISOString().slice(0, 10);
}

function ajouterSemaines(lundi: string, n: number): string {
  const d = jour(lundi);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

export function calculerStatistiques(
  donnees: { prospections: ProspectionStat[]; candidatures: CandidatureStat[]; courrier: CourrierStat[] },
  aujourdhui: string,
  nbSemaines = 8,
): Statistiques {
  const lundiCourant = lundiDeLaSemaine(aujourdhui);
  const semaines: SemaineStat[] = [];
  for (let i = nbSemaines - 1; i >= 0; i--) {
    semaines.push({ debut: ajouterSemaines(lundiCourant, -i), envois: 0, accuses: 0, refus: 0, entretiens: 0 });
  }
  const parLundi = new Map(semaines.map((s) => [s.debut, s]));
  const compter = (date: string | null, champ: keyof Omit<SemaineStat, "debut">) => {
    if (!date) return;
    const semaine = parLundi.get(lundiDeLaSemaine(date));
    if (semaine) semaine[champ] += 1;
  };

  // Seuls les premiers messages comptent comme des envois : une relance n'est pas une nouvelle candidature.
  const initiales = donnees.prospections.filter((p) => p.type === "initial" && p.date_envoi);
  const offresEnvoyees = donnees.candidatures.filter((c) => c.statut !== "a_traiter" && c.date_envoi);

  for (const p of initiales) compter(p.date_envoi, "envois");
  for (const c of offresEnvoyees) compter(c.date_envoi, "envois");
  for (const m of donnees.courrier) {
    if (m.nature === "accuse_reception") compter(m.date_mail, "accuses");
    else if (m.nature === "refus") compter(m.date_mail, "refus");
    else if (m.nature === "entretien") compter(m.date_mail, "entretiens");
  }

  const avecReponse = initiales.filter((p) => p.reponse_date);
  const delais = avecReponse
    .map((p) => Math.round((jour(p.reponse_date as string).getTime() - jour(p.date_envoi as string).getTime()) / 86_400_000))
    .filter((d) => d >= 0);

  const total = {
    envois: initiales.length + offresEnvoyees.length,
    accuses: donnees.courrier.filter((m) => m.nature === "accuse_reception").length,
    refus: donnees.courrier.filter((m) => m.nature === "refus").length,
    entretiens: donnees.courrier.filter((m) => m.nature === "entretien").length,
  };

  return {
    semaines,
    spontanees: {
      envoyees: initiales.length,
      reponses: avecReponse.length,
      tauxReponse: initiales.length > 0 ? Math.round((avecReponse.length / initiales.length) * 100) : null,
      delaiMoyenJours: delais.length > 0 ? Math.round(delais.reduce((a, b) => a + b, 0) / delais.length) : null,
    },
    offres: { envoyees: offresEnvoyees.length },
    total,
  };
}
