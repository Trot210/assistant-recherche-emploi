// Bilan hebdomadaire des lettres d'information rangées dans « Lettres d'information » : qui t'écrit le plus, et
// le lien pour se désinscrire. Calcul pur ; la lecture du dossier est dans lib/mail/dossier.ts.

export interface LettreLue {
  adresse: string;
  nom: string | null;
  // En-tête List-Unsubscribe tel que reçu (peut être vide).
  enteteDesinscription: string;
}

export interface ExpediteurLettres {
  nom: string;
  adresse: string;
  nombre: number;
  lien: string | null;
}

// En-tête List-Unsubscribe : une liste de liens entre chevrons, « <https://…>, <mailto:…> ». On préfère le lien
// https (un clic) à l'adresse mailto ; tout autre schéma est écarté. Les en-têtes longs sont repliés sur plusieurs lignes.
export function lienDesinscription(entete: string): string | null {
  const nettoye = entete.replace(/^list-unsubscribe\s*:/i, "").replace(/\r?\n[ \t]+/g, " ");
  const liens = [...nettoye.matchAll(/<([^>]+)>/g)].map((m) => m[1].trim());
  return liens.find((l) => /^https:\/\//i.test(l)) ?? liens.find((l) => /^mailto:/i.test(l)) ?? null;
}

export function regrouperLettres(lettres: LettreLue[]): ExpediteurLettres[] {
  const parAdresse = new Map<string, ExpediteurLettres>();
  for (const l of lettres) {
    const cle = l.adresse.toLowerCase();
    const lien = lienDesinscription(l.enteteDesinscription);
    const existant = parAdresse.get(cle);
    if (existant) {
      existant.nombre += 1;
      existant.lien ??= lien;
    } else {
      parAdresse.set(cle, { nom: l.nom?.trim() || cle.split("@")[1] || cle, adresse: cle, nombre: 1, lien });
    }
  }
  return [...parAdresse.values()].sort((a, b) => b.nombre - a.nombre || a.nom.localeCompare(b.nom));
}

// Le bilan n'est envoyé que le lundi (heure de Paris).
export function estLundi(jour: string): boolean {
  return new Date(`${jour}T12:00:00Z`).getUTCDay() === 1;
}
