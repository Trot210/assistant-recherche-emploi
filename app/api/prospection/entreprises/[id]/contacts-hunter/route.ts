import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hunterConfigure, quotaHunter, QuotaHunterEpuise, rechercherEmailsDomaine } from "@/lib/hunter/client";
import { choisirContactsHunter } from "@/lib/hunter/selection";
import { extraireDomaine } from "@/lib/prospection/fiche";

// Une recherche = une unité du quota mensuel gratuit de Hunter : elle n'est
// lancée que sur clic explicite, jamais automatiquement.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (!hunterConfigure()) {
    return NextResponse.json({ error: "Hunter n'est pas configuré (HUNTER_API_KEY)" }, { status: 501 });
  }

  const { data: entreprise, error } = await supabase
    .from("entreprises")
    .select()
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!entreprise) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });

  const domaine = extraireDomaine(entreprise.site_web ?? entreprise.fiche?.site_web);
  if (!domaine) {
    return NextResponse.json(
      { error: "Site web inconnu : analyse d'abord l'entreprise pour le trouver" },
      { status: 400 },
    );
  }

  try {
    const { data: existants } = await supabase
      .from("contacts")
      .select("email")
      .eq("entreprise_id", entreprise.id)
      .eq("user_id", user.id);

    const { emails, pays } = await rechercherEmailsDomaine(domaine, entreprise.nom);
    const choisis = choisirContactsHunter(
      emails,
      (existants ?? []).map((c) => c.email).filter((e): e is string => Boolean(e)),
    );

    const { data: contacts, error: insertError } =
      choisis.length > 0
        ? await supabase
            .from("contacts")
            .insert(
              choisis.map((c) => ({
                user_id: user.id,
                entreprise_id: entreprise.id,
                nom: c.nom,
                poste: c.poste,
                email: c.email,
                origine: "hunter" as const,
                pays,
                source_url: c.source_url,
                source_email: `Hunter.io${c.source_url ? ` — page source : ${c.source_url}` : ""}`,
              })),
            )
            .select()
        : { data: [], error: null };
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    // On note qu'une recherche a été faite (même sans résultat) pour ne pas
    // consommer une deuxième fois le quota sur la même entreprise.
    let misAJour = entreprise;
    if (entreprise.fiche) {
      const { data } = await supabase
        .from("entreprises")
        .update({ fiche: { ...entreprise.fiche, hunter_recherche_at: new Date().toISOString() } })
        .eq("id", entreprise.id)
        .eq("user_id", user.id)
        .select()
        .single();
      if (data) misAJour = data;
    }

    return NextResponse.json({
      entreprise: misAJour,
      contacts,
      trouves: emails.length,
      quota: await quotaHunter(),
    });
  } catch (e) {
    if (e instanceof QuotaHunterEpuise) {
      return NextResponse.json({ error: e.message }, { status: 429 });
    }
    console.error("Erreur recherche Hunter:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur inconnue lors de la recherche Hunter" },
      { status: 502 },
    );
  }
}
