import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { memeEntreprise } from "@/lib/prospection/offres";
import { normaliserReponse } from "@/lib/prospection/recherche-entreprises";

const SEARCH_URL = "https://recherche-entreprises.api.gouv.fr/search";

// Cible l'employeur d'une offre : retrouve l'entreprise dans la base Sirene
// (gratuite) à partir de son nom, l'ajoute à ta liste et note l'offre comme
// « offre repérée ». Aucun appel à Claude.
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const corps = await request.json().catch(() => null);
  const employeur = typeof corps?.employeur === "string" ? corps.employeur.trim().slice(0, 120) : "";
  const titre = typeof corps?.titre === "string" ? corps.titre.trim().slice(0, 200) : "";
  const lien = typeof corps?.lien === "string" ? corps.lien.trim().slice(0, 500) : "";
  if (!employeur) return NextResponse.json({ error: "employeur est requis" }, { status: 400 });

  let lienValide: string | null = null;
  if (lien) {
    try {
      const u = new URL(lien);
      if (u.protocol === "https:" || u.protocol === "http:") lienValide = lien;
    } catch {
      lienValide = null;
    }
  }

  const res = await fetch(`${SEARCH_URL}?${new URLSearchParams({ q: employeur, etat_administratif: "A", per_page: "10" })}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    return NextResponse.json({ error: `La base Sirene n'a pas répondu (${res.status}), réessaie dans un instant` }, { status: 502 });
  }

  // Parmi les résultats qui portent bien le nom de l'employeur, on retient la
  // plus grande structure : c'est celle qui a un siège et des services métier.
  const candidats = normaliserReponse(await res.json())
    .entreprises.filter((e) => memeEntreprise(e.nom, employeur))
    .sort((a, b) => Number(b.tranche_effectif ?? 0) - Number(a.tranche_effectif ?? 0));
  const trouvee = candidats[0];
  if (!trouvee) {
    return NextResponse.json(
      { error: `« ${employeur} » n'a pas été retrouvée dans la base Sirene : ajoute-la depuis la recherche d'entreprises.` },
      { status: 404 },
    );
  }

  const { data: existante } = await supabase
    .from("entreprises")
    .select()
    .eq("user_id", user.id)
    .eq("siren", trouvee.siren)
    .maybeSingle();

  const offre = { offre_reperee_titre: titre || null, offre_reperee_url: lienValide };

  if (existante) {
    const { data, error } = await supabase
      .from("entreprises")
      .update(offre)
      .eq("id", existante.id)
      .eq("user_id", user.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entreprise: data, deja_ciblee: true });
  }

  const { data, error } = await supabase
    .from("entreprises")
    .insert({
      user_id: user.id,
      siren: trouvee.siren,
      nom: trouvee.nom,
      code_naf: trouvee.code_naf,
      secteur: null,
      tranche_effectif: trouvee.tranche_effectif,
      adresse: trouvee.adresse,
      code_postal: trouvee.code_postal,
      commune: trouvee.commune,
      departement: trouvee.departement,
      ...offre,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entreprise: data, deja_ciblee: false });
}
