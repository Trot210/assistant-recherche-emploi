// Génération CSV volontairement sans dépendance externe : la lib npm "xlsx"
// (SheetJS) a deux CVE non corrigées sur le registre npm (pollution de
// prototype, ReDoS) — inutile d'en prendre le risque pour un simple export,
// alors qu'Excel/Numbers/Sheets ouvrent nativement un CSV.
export function versLigneCsv(champs: (string | number | null | undefined)[], separateur = ";"): string {
  return champs
    .map((champ) => {
      const texte = champ == null ? "" : String(champ);
      if (texte.includes(separateur) || texte.includes('"') || texte.includes("\n")) {
        return `"${texte.replace(/"/g, '""')}"`;
      }
      return texte;
    })
    .join(separateur);
}

export function telechargerCsv(nomFichier: string, lignes: string[]): void {
  // BOM UTF-8 : sans lui, Excel (notamment en localisation Windows/FR)
  // affiche les accents de travers.
  const contenu = `﻿${lignes.join("\r\n")}`;
  const blob = new Blob([contenu], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  document.body.removeChild(lien);
  URL.revokeObjectURL(url);
}
