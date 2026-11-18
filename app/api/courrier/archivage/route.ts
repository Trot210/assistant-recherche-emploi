import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dossierDisponible } from "@/lib/mail/dossier";
import { archiverMailsLus } from "@/lib/mail/archivage";
import { JOURS_AVANT_ARCHIVAGE } from "@/lib/prospection/archivage";
import { normaliserIdMessage } from "@/lib/prospection/reponses";

export const maxDuration = 60;

// Archive les vieux mails lus de la boîte de réception (ils restent dans « Tous les messages », rien n'est
// supprimé). Par défaut, simple aperçu : seul `apercu: false` déplace quelque chose, et le site le demande
// uniquement après que tu as vu la liste.
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
  const jours = typeof corps?.jours === "number" && corps.jours >= 7 && corps.jours <= 365 ? Math.floor(corps.jours) : JOURS_AVANT_ARCHIVAGE;

  // Les mails de candidature qui demandent encore une action restent en boîte de réception.
  const proteges = new Set<string>();
  const { data: aFaire } = await supabase
    .from("courrier_candidatures")
    .select("message_id, message_id_brut")
    .eq("user_id", user.id)
    .eq("action_requise", true)
    .is("action_faite_at", null);
  for (const l of aFaire ?? []) {
    for (const id of [l.message_id, l.message_id_brut]) {
      const propre = normaliserIdMessage(id);
      if (propre) proteges.add(propre);
    }
  }

  try {
    return NextResponse.json(await archiverMailsLus({ jours, apercu, proteges }));
  } catch (e) {
    console.error("Erreur d'archivage:", e);
    return NextResponse.json({ error: `Archivage impossible : ${e instanceof Error ? e.message : "erreur inconnue"}` }, { status: 502 });
  }
}
