import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dossierDisponible, lireLettresRecentes } from "@/lib/mail/dossier";
import { regrouperLettres } from "@/lib/prospection/lettres-information";

export const maxDuration = 60;

// Lettres d'information reçues ces 30 derniers jours (dossier « Lettres d'information »), par expéditeur, avec
// le lien de désinscription quand le mail en fournit un. Lecture seule : le site ne se désinscrit jamais à ta place.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!dossierDisponible()) {
    return NextResponse.json({ error: "La boîte mail n'est pas configurée : renseigne SMTP_USER et SMTP_PASSWORD dans .env.local" }, { status: 501 });
  }
  try {
    const lettres = regrouperLettres(await lireLettresRecentes({ jours: 30 }));
    return NextResponse.json({ lettres });
  } catch (e) {
    console.error("Lecture des lettres d'information impossible:", e);
    return NextResponse.json({ error: `Lecture impossible : ${e instanceof Error ? e.message : "erreur inconnue"}` }, { status: 502 });
  }
}
