import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  decomposerParis,
  etalerEnvois,
  formaterProgrammation,
  parisVersUtc,
  validerProgrammation,
} from "@/lib/prospection/planification";
import { lireReglagesEnvois } from "@/lib/prospection/programmations";
import { verifierProgrammable } from "@/lib/prospection/programmer";

const MAX_MESSAGES = 30;
const MAX_PAR_JOUR_ETALEMENT = 3;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Répartit des messages validés sur plusieurs jours ouvrés, à des heures variées.
// Deux temps : « apercu » propose un calendrier sans rien enregistrer ; « creer » le
// programme, après ta confirmation, tel que tu l'as vu (tu peux avoir modifié des horaires).
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const reglages = await lireReglagesEnvois(supabase, user.id);
  const maintenant = new Date();

  // --- Création du calendrier confirmé -------------------------------------
  if (body?.mode === "creer") {
    if (body.confirme !== true) return NextResponse.json({ error: "Confirme le calendrier avant de programmer" }, { status: 400 });
    const plan: unknown = body.plan;
    if (!Array.isArray(plan) || plan.length === 0 || plan.length > MAX_MESSAGES) {
      return NextResponse.json({ error: `plan doit contenir de 1 à ${MAX_MESSAGES} messages` }, { status: 400 });
    }

    const crees: string[] = [];
    const refuses: { prospection_id: string; raison: string }[] = [];
    for (const element of plan as { prospection_id?: unknown; prevu_at?: unknown }[]) {
      const id = element?.prospection_id;
      const quand = element?.prevu_at;
      if (typeof id !== "string" || typeof quand !== "string") {
        refuses.push({ prospection_id: String(id), raison: "Ligne du calendrier invalide" });
        continue;
      }
      const instant = new Date(quand);
      const validation = validerProgrammation(instant, maintenant);
      if (validation.erreur) {
        refuses.push({ prospection_id: id, raison: validation.erreur });
        continue;
      }
      const { data: prospection } = await supabase.from("prospections").select().eq("id", id).eq("user_id", user.id).maybeSingle();
      if (!prospection) {
        refuses.push({ prospection_id: id, raison: "Message introuvable" });
        continue;
      }
      const probleme = await verifierProgrammable(supabase, user.id, prospection);
      if (probleme) {
        refuses.push({ prospection_id: id, raison: probleme });
        continue;
      }
      const { error } = await supabase
        .from("envois_programmes")
        .insert({ user_id: user.id, prospection_id: id, prevu_at: instant.toISOString(), origine: "etalement" });
      if (error) refuses.push({ prospection_id: id, raison: error.code === "23505" ? "Déjà programmé" : error.message });
      else crees.push(id);
    }
    return NextResponse.json({ crees, refuses });
  }

  // --- Aperçu ---------------------------------------------------------------
  const ids: unknown = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_MESSAGES || ids.some((i) => typeof i !== "string")) {
    return NextResponse.json({ error: `ids doit contenir de 1 à ${MAX_MESSAGES} messages` }, { status: 400 });
  }

  let debut: string;
  if (body?.debut !== undefined) {
    if (typeof body.debut !== "string" || !DATE.test(body.debut)) {
      return NextResponse.json({ error: "debut doit être une date AAAA-MM-JJ" }, { status: 400 });
    }
    debut = body.debut;
  } else {
    // Par défaut dès demain : le temps de relire le calendrier.
    debut = decomposerParis(new Date(parisVersUtc(decomposerParis(maintenant).date, "12:00").getTime() + 86_400_000)).date;
  }

  const maxParJour = Math.min(
    typeof body?.max_par_jour === "number" && body.max_par_jour >= 1 ? Math.floor(body.max_par_jour) : MAX_PAR_JOUR_ETALEMENT,
    reglages.maxParJour,
  );

  const retenus: { id: string; entreprise: string; poste: string; destinataire: string | null }[] = [];
  const ignores: { id: string; raison: string }[] = [];
  for (const id of ids as string[]) {
    const { data: prospection } = await supabase.from("prospections").select().eq("id", id).eq("user_id", user.id).maybeSingle();
    if (!prospection) {
      ignores.push({ id, raison: "Message introuvable" });
      continue;
    }
    const { data: actif } = await supabase
      .from("envois_programmes")
      .select("id")
      .eq("user_id", user.id)
      .eq("prospection_id", id)
      .in("statut", ["programme", "en_cours"])
      .maybeSingle();
    if (actif) {
      ignores.push({ id, raison: "Déjà programmé" });
      continue;
    }
    const probleme = await verifierProgrammable(supabase, user.id, prospection);
    if (probleme) {
      ignores.push({ id, raison: probleme });
      continue;
    }
    const [{ data: entreprise }, { data: contact }] = await Promise.all([
      supabase.from("entreprises").select("nom").eq("id", prospection.entreprise_id).maybeSingle(),
      prospection.contact_id ? supabase.from("contacts").select("nom, email").eq("id", prospection.contact_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    retenus.push({ id, entreprise: entreprise?.nom ?? "Entreprise", poste: prospection.poste_vise, destinataire: contact?.email ?? null });
  }

  const { data: occupes } = await supabase.from("envois_programmes").select("prevu_at").eq("user_id", user.id).eq("statut", "programme");
  const creneaux = etalerEnvois({
    nombre: retenus.length,
    debut,
    maxParJour,
    ecartMinutes: reglages.ecartMinutes,
    occupes: (occupes ?? []).map((o) => new Date(o.prevu_at)),
  });

  return NextResponse.json({
    plan: retenus.map((r, i) => ({
      prospection_id: r.id,
      entreprise: r.entreprise,
      poste: r.poste,
      destinataire: r.destinataire,
      prevu_at: creneaux[i].instant.toISOString(),
      quand: formaterProgrammation(creneaux[i].instant),
    })),
    ignores,
    max_par_jour: maxParJour,
  });
}
