import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appliquerSuivi, estTypeReponse } from "@/lib/prospection/suivi";
import { estPolitique } from "@/lib/prospection/politique";
import { aujourdhuiParis } from "@/lib/prospection/workflow";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Enregistre une réponse que l'utilisateur a validée : elle met à jour le suivi
// de la candidature (type, date, court extrait, lien) et se souvient que ce
// message de la boîte mail est traité, pour ne plus le proposer.
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
  const prospectionId: unknown = corps?.prospection_id;
  const type: unknown = corps?.type;
  const date: unknown = corps?.date;
  const extrait: unknown = corps?.extrait;
  const url: unknown = corps?.url;
  // Décisions facultatives de l'utilisateur, prises avec la réponse sous les yeux.
  const politique: unknown = corps?.politique;
  const nePlusContacter: unknown = corps?.ne_plus_contacter;

  if (typeof messageId !== "string" || !messageId || typeof prospectionId !== "string") {
    return NextResponse.json({ error: "message_id et prospection_id sont requis" }, { status: 400 });
  }
  if (!estTypeReponse(type)) {
    return NextResponse.json({ error: "type de réponse invalide" }, { status: 400 });
  }
  if (politique !== undefined && politique !== null && !estPolitique(politique)) {
    return NextResponse.json({ error: "politique invalide" }, { status: 400 });
  }
  if (date !== undefined && date !== null && (typeof date !== "string" || !DATE.test(date))) {
    return NextResponse.json({ error: "date doit être au format AAAA-MM-JJ" }, { status: 400 });
  }
  if (extrait !== undefined && extrait !== null && (typeof extrait !== "string" || extrait.length > 700)) {
    return NextResponse.json({ error: "extrait invalide (700 caractères maximum)" }, { status: 400 });
  }
  if (url !== undefined && url !== null && url !== "") {
    let valide = false;
    try {
      const u = new URL(String(url));
      valide = (u.protocol === "https:" || u.protocol === "http:") && String(url).length <= 500;
    } catch {
      valide = false;
    }
    if (!valide) return NextResponse.json({ error: "url invalide" }, { status: 400 });
  }

  const { data: prospection, error } = await supabase
    .from("prospections")
    .select()
    .eq("id", prospectionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!prospection) return NextResponse.json({ error: "Candidature introuvable" }, { status: 404 });

  const resultat = appliquerSuivi(prospection, type, aujourdhuiParis(), typeof date === "string" ? date : null);
  if ("erreur" in resultat) return NextResponse.json({ error: resultat.erreur }, { status: 409 });

  const maintenant = new Date().toISOString();
  const { data: misAJour, error: updateError } = await supabase
    .from("prospections")
    .update({
      ...resultat.patch,
      ...(typeof date === "string" ? { reponse_date: date } : {}),
      reponse_extrait: typeof extrait === "string" && extrait ? extrait : null,
      reponse_url: typeof url === "string" && url ? url : null,
      updated_at: maintenant,
    })
    .eq("id", prospection.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  if (resultat.abandonnerRelancesEnCours) {
    await supabase
      .from("prospections")
      .update({ statut: "sans_suite", updated_at: maintenant })
      .eq("parent_id", prospection.id)
      .eq("user_id", user.id)
      .in("statut", ["a_valider", "valide", "brouillon_gmail"]);
  }

  // Suites choisies par l'utilisateur : politique de l'entreprise, adresse du
  // contact à ne plus utiliser (rebond ou demande explicite).
  if (estPolitique(politique)) {
    const { error: politiqueError } = await supabase
      .from("entreprises")
      .update({ politique_candidature: politique })
      .eq("id", prospection.entreprise_id)
      .eq("user_id", user.id);
    if (politiqueError) return NextResponse.json({ error: politiqueError.message }, { status: 500 });
  }
  const statutAdresse = nePlusContacter === true ? "ne_plus_contacter" : type === "non_distribue" ? "invalide" : null;
  if (statutAdresse && prospection.contact_id) {
    const { error: contactError } = await supabase
      .from("contacts")
      .update({ email_statut: statutAdresse })
      .eq("id", prospection.contact_id)
      .eq("user_id", user.id);
    if (contactError) return NextResponse.json({ error: contactError.message }, { status: 500 });
  }

  const { error: traiteeError } = await supabase
    .from("reponses_traitees")
    .upsert(
      { user_id: user.id, message_id: messageId, prospection_id: prospection.id, decision: "associee" },
      { onConflict: "user_id,message_id" },
    );
  if (traiteeError) return NextResponse.json({ error: traiteeError.message }, { status: 500 });

  return NextResponse.json({ prospection: misAJour });
}
