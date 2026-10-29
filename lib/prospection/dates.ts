// AAAA-MM-JJ -> JJ/MM/AAAA
export function formaterDateFr(dateIso: string | null | undefined): string {
  if (!dateIso) return "";
  const [annee, mois, jour] = dateIso.split("-");
  return `${jour}/${mois}/${annee}`;
}
