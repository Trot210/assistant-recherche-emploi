import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dossierDisponible } from "@/lib/mail/dossier";
import { nettoyerDossiers } from "@/lib/mail/nettoyage";
import { JOURS_AVANT_NETTOYAGE } from "@/lib/prospection/nettoyage";

export const maxDuration = 60;

// Nettoyage des dossiers « Refus » et « En attente réponse » : les mails reçus il y a plus de 30 jours
// vont à la corbeille de la boîte mail (récupérables ; rien n'est effacé définitivement). `apercu: true`
// dit seulement ce qui serait nettoyé, sans toucher à rien.
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  if (!dossierDisponible()) {
    return NextResponse.json({ error: "La boîte mail n'est pas configurée : renseigne SMTP_USER et SMTP_PASSWORD dans .env.local" }, { status: 501 });
  }

  const corps = await request.json().catch(() => null);
  const apercu = corps?.apercu !== false;

  try {
    return NextResponse.json(await nettoyerDossiers({ jours: JOURS_AVANT_NETTOYAGE, apercu }));
  } catch (e) {
    console.error("Erreur de nettoyage des dossiers:", e);
    return NextResponse.json({ error: `Nettoyage impossible : ${e instanceof Error ? e.message : "erreur inconnue"}` }, { status: 502 });
  }
}
