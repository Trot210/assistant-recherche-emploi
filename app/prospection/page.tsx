import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Prospection from "@/components/prospection/Prospection";
import { gmailConfigure } from "@/lib/gmail/client";

export default async function ProspectionPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Calculé côté serveur : les identifiants Gmail ne doivent jamais atteindre
  // le navigateur, seul le fait qu'ils soient présents ou non.
  return <Prospection userId={user.id} gmailActif={gmailConfigure()} />;
}
