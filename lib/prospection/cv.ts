import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Langue } from "@/types/database.types";

// Les CV de référence sont les PDF de l'utilisateur, joints tels quels : pas de
// CV régénéré par l'IA pour chaque message (plus rapide, gratuit, et mise en
// page respectée). Un fichier par langue, dans le dossier privé du bucket
// "documents" (voir migration 0005 : accès limité à son propre dossier). Le CV
// joint est celui de la langue du message.
const TAILLE_MAX_OCTETS = 5 * 1024 * 1024;

export function nomFichierCv(langue: Langue): string {
  return langue === "en" ? "cv-reference-en.pdf" : "cv-reference.pdf";
}

export function cheminCvReference(userId: string, langue: Langue = "fr"): string {
  return `${userId}/${nomFichierCv(langue)}`;
}

export function libelleCv(langue: Langue): string {
  return langue === "en" ? "CV en anglais" : "CV en français";
}

// Les PDF commencent par "%PDF-" : on vérifie le contenu, pas seulement le
// type annoncé par le navigateur.
export function validerPdf(octets: Uint8Array): string | null {
  if (octets.length === 0) return "Le fichier est vide";
  if (octets.length > TAILLE_MAX_OCTETS) return "Le CV dépasse 5 Mo";
  const entete = new TextDecoder().decode(octets.slice(0, 5));
  return entete === "%PDF-" ? null : "Ce fichier n'est pas un PDF";
}

// Nom du fichier tel que le destinataire le voit en pièce jointe.
export function nomPieceJointeCv(nomCandidat: string | null | undefined, langue: Langue = "fr"): string {
  const nom = (nomCandidat ?? "").replace(/[^\p{L}\p{N} '-]/gu, " ").replace(/\s+/g, " ").trim();
  const suffixe = langue === "en" ? " (English)" : "";
  return nom ? `CV ${nom}${suffixe}.pdf` : `CV${suffixe}.pdf`;
}

export interface CvReference {
  contenu: Buffer;
  taille: number;
}

export async function lireCvReference(
  supabase: SupabaseClient<Database>,
  userId: string,
  langue: Langue = "fr",
): Promise<CvReference | null> {
  const { data, error } = await supabase.storage.from("documents").download(cheminCvReference(userId, langue));
  if (error || !data) return null;
  const contenu = Buffer.from(await data.arrayBuffer());
  return { contenu, taille: contenu.length };
}
