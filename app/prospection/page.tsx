import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Prospection from "@/components/prospection/Prospection";
import { gmailConfigure } from "@/lib/gmail/client";
import { hunterConfigure } from "@/lib/hunter/client";

export default async function ProspectionPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Calculé côté serveur : les clés Gmail et Hunter ne doivent jamais atteindre
  // le navigateur, seul le fait qu'elles soient présentes ou non.
  return <Prospection userId={user.id} gmailActif={gmailConfigure()} hunterActif={hunterConfigure()} />;
}
