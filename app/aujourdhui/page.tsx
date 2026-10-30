import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Aujourdhui from "@/components/Aujourdhui";
import { imapConfigure } from "@/lib/mail/imap";

export default async function AujourdhuiPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Calculé côté serveur : seul le fait que la lecture de la boîte soit configurée
  // atteint le navigateur, jamais les identifiants.
  return <Aujourdhui imapActif={imapConfigure()} />;
}
