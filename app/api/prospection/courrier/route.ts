import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lireBilanUsage, plafondAtteint, suivreUsage } from "@/lib/anthropic/usage";
import { dossierDisponible } from "@/lib/mail/dossier";
import { analyserCourrier, rangerCourrierAnalyse } from "@/lib/prospection/service-courrier";

// Lecture de la boîte, jusqu'à 25 lectures par Claude, puis déplacements : plus long qu'une route ordinaire.
export const maxDuration = 60;

const MAX_LECTURES = 25;

// Tri des mails de candidature de la boîte (accusés de réception → « En attente réponse », refus →
// « Refus »). Deux actions : « analyser » lit les mails pas encore classés et en garde le résultat sans
// rien déplacer ; « ranger » déplace ce qui a été analysé. Rien n'est supprimé, ni envoyé.
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
  const action = corps?.action === "ranger" ? "ranger" : "analyser";

  try {
    if (action === "ranger") {
      return NextResponse.json({ action, ...(await rangerCourrierAnalyse(supabase, user.id, { apercu: false })) });
    }

    suivreUsage(supabase, user.id, "courrier-candidatures");
    const bilanUsage = await lireBilanUsage(supabase, user.id).catch(() => null);
    const claudeDisponible = bilanUsage ? !plafondAtteint(bilanUsage) : true;
    if (!claudeDisponible) {
      return NextResponse.json({ error: "Plafond mensuel Claude atteint : relève-le dans les réglages pour lire les mails.", code: "plafond_claude" }, { status: 402 });
    }

    const analyse = await analyserCourrier(supabase, user.id, { jours: 120, max: MAX_LECTURES, claudeDisponible, avecProspection: true });
    const rangement = await rangerCourrierAnalyse(supabase, user.id, { apercu: true });
    return NextResponse.json({ action, ...analyse, aRanger: rangement.aRanger });
  } catch (e) {
    console.error("Erreur de tri des mails de candidature:", e);
    const detail = e instanceof Error ? e.message : "Erreur inconnue";
    const aide = /auth|login|credentials|AUTHENTICATIONFAILED/i.test(detail) ? " — vérifie le mot de passe d'application Gmail et que l'accès IMAP est activé" : "";
    return NextResponse.json({ error: `Tri impossible : ${detail}${aide}` }, { status: 502 });
  }
}
