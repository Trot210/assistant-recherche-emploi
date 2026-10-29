import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// L'utilisateur écarte une réponse proposée (hors sujet, message automatique...) :
// on s'en souvient pour ne plus la reproposer à la prochaine recherche.
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const corps = await request.json().catch(() => null);
  const messageId: unknown = corps?.message_id;
  if (typeof messageId !== "string" || !messageId) {
    return NextResponse.json({ error: "message_id est requis" }, { status: 400 });
  }

  const { error } = await supabase
    .from("reponses_traitees")
    .upsert({ user_id: user.id, message_id: messageId, decision: "ignoree" }, { onConflict: "user_id,message_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
