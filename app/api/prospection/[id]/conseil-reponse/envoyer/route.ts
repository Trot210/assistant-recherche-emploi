import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { envoyerReponse } from "@/lib/prospection/envoyer-reponse";

// Envoie la réponse relue et confirmée par l'utilisateur, dans le fil de la
// conversation. Un clic = un envoi : rien ne part automatiquement, et le texte
// envoyé est celui reçu ici (l'utilisateur l'a modifié et relu à l'écran).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const corps = await request.json().catch(() => null);
  const objet: unknown = corps?.objet;
  const message: unknown = corps?.corps;
  if (typeof objet !== "string" || typeof message !== "string") {
    return NextResponse.json({ error: "objet et corps sont requis" }, { status: 400 });
  }

  const resultat = await envoyerReponse(supabase, user.id, id, { objet, corps: message });
  if (!resultat.ok) return NextResponse.json({ error: resultat.erreur }, { status: resultat.statut });
  return NextResponse.json({ destinataire: resultat.destinataire, envoye_le: resultat.envoye_le });
}
