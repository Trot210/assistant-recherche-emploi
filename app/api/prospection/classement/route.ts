import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dossierDisponible, NOM_DOSSIER } from "@/lib/mail/dossier";
import { classerEchanges } from "@/lib/prospection/classement-courrier";

// Lecture de la boîte mail (boîte entière pour la reprise de l'existant) puis, si demandé,
// copies et déplacements : plus long qu'une route ordinaire.
export const maxDuration = 60;

// Reprise de l'existant : classe dans le dossier « Prospection » tous les messages envoyés par le
// site et toutes les réponses reçues, archives comprises. `apercu: true` dit seulement ce qui
// serait classé, sans rien toucher ; sans lui, les messages sont copiés (envoyés) ou déplacés
// hors de la boîte de réception (réponses). Rien n'est supprimé.
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
    const resultat = await classerEchanges(supabase, user.id, { jours: 365, toutes: true, apercu });
    return NextResponse.json({ ...resultat, dossier: NOM_DOSSIER });
  } catch (e) {
    console.error("Erreur de classement dans le dossier:", e);
    const detail = e instanceof Error ? e.message : "Erreur inconnue";
    const aide = /auth|login|credentials|AUTHENTICATIONFAILED/i.test(detail) ? " — vérifie le mot de passe d'application Gmail et que l'accès IMAP est activé" : "";
    return NextResponse.json({ error: `Classement impossible : ${detail}${aide}` }, { status: 502 });
  }
}
