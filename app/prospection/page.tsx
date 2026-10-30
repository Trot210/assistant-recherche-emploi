import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Prospection, { type Onglet } from "@/components/prospection/Prospection";
import { gmailConfigure } from "@/lib/gmail/client";
import { hunterConfigure } from "@/lib/hunter/client";
import { imapConfigure } from "@/lib/mail/imap";
import { smtpConfigure } from "@/lib/mail/smtp";

const ONGLETS: Onglet[] = ["entreprises", "messages", "relances"];

export default async function ProspectionPage({ searchParams }: { searchParams: Promise<{ onglet?: string }> }) {
  const { onglet } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Calculé côté serveur : les clés Gmail, Hunter et d'envoi ne doivent jamais atteindre
  // le navigateur, seul le fait qu'elles soient présentes ou non.
  return (
    <Prospection
      userId={user.id}
      gmailActif={gmailConfigure()}
      hunterActif={hunterConfigure()}
      smtpActif={smtpConfigure()}
      imapActif={imapConfigure()}
      ongletInitial={ONGLETS.find((o) => o === onglet)}
    />
  );
}
