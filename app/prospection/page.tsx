import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Prospection, { type FiltreMessages, type Onglet } from "@/components/prospection/Prospection";
import { hunterConfigure } from "@/lib/hunter/client";
import { imapConfigure } from "@/lib/mail/imap";
import { smtpConfigure } from "@/lib/mail/smtp";

const ONGLETS: Onglet[] = ["entreprises", "messages", "relances", "bilan"];
const FILTRES: FiltreMessages[] = ["en_cours", "programmes", "envoyes", "tous"];

export default async function ProspectionPage({ searchParams }: { searchParams: Promise<{ onglet?: string; filtre?: string }> }) {
  const { onglet, filtre } = await searchParams;
  // Ancien lien « ?onglet=programmes » : les envois programmés sont un filtre de Messages.
  const versProgrammes = onglet === "programmes";
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Calculé côté serveur : les clés Hunter et d'envoi ne doivent jamais atteindre
  // le navigateur, seul le fait qu'elles soient présentes ou non.
  return (
    <Prospection
      userId={user.id}
      hunterActif={hunterConfigure()}
      smtpActif={smtpConfigure()}
      imapActif={imapConfigure()}
      ongletInitial={versProgrammes ? "messages" : ONGLETS.find((o) => o === onglet)}
      filtreInitial={versProgrammes ? "programmes" : FILTRES.find((f) => f === filtre)}
    />
  );
}
