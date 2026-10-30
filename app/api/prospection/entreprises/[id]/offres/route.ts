import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchOffres } from "@/lib/france-travail/client";
import {
  lienOffreFranceTravail,
  liensRecherche,
  marqueEntreprise,
  selectionnerOffres,
  type OffreTrouvee,
} from "@/lib/prospection/offres";

// Cherche les offres déjà publiées par l'entreprise, avant d'écrire : dans la
// base d'offres de l'application, puis sur France Travail. Aucun appel à Claude,
// donc aucun coût. LinkedIn, Welcome to the Jungle et Indeed ne sont pas
// interrogés (pas d'API ouverte) : on prépare seulement des liens de recherche.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const corps = await request.json().catch(() => null);
  const posteVise = typeof corps?.poste_vise === "string" ? corps.poste_vise.trim().slice(0, 80) : "";

  const { data: entreprise, error } = await supabase
    .from("entreprises")
    .select()
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!entreprise) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });

  const marque = marqueEntreprise(entreprise.nom);
  const trouvees: OffreTrouvee[] = [];
  let baseLue = false;
  let franceTravailLue = false;

  if (marque) {
    // La marque ne contient que des lettres et des chiffres : rien à échapper dans le motif.
    const { data: offresBase } = await supabase
      .from("offres")
      .select("id, titre, entreprise, localisation, date_publication, lien_original, created_at")
      .eq("user_id", user.id)
      .ilike("entreprise", `%${marque}%`)
      .order("created_at", { ascending: false })
      .limit(100);
    if (offresBase) {
      baseLue = true;
      for (const o of offresBase) {
        trouvees.push({
          titre: o.titre,
          employeur: o.entreprise,
          lieu: o.localisation,
          date: (o.date_publication ?? o.created_at)?.slice(0, 10) ?? null,
          lien: o.lien_original || null,
          source: "base",
          offreId: o.id,
        });
      }
    }

    // France Travail ne filtre pas par employeur : on cherche la marque dans les
    // offres récentes et on garde celles dont l'employeur correspond. Recherche
    // partielle, signalée comme telle à l'utilisateur.
    try {
      const reponse = await searchOffres({ motsCles: marque, sort: 1, range: "0-49" });
      franceTravailLue = true;
      for (const o of reponse.resultats) {
        trouvees.push({
          titre: o.intitule,
          employeur: o.entreprise?.nom ?? null,
          lieu: o.lieuTravail?.libelle ?? null,
          date: o.dateCreation?.slice(0, 10) ?? null,
          lien: o.origineOffre?.urlOrigine || lienOffreFranceTravail(o.id),
          source: "france_travail",
          offreId: null,
        });
      }
    } catch (e) {
      console.error("Recherche d'offres France Travail impossible:", e);
    }
  }

  const offres = selectionnerOffres(entreprise.nom, trouvees).slice(0, 8);

  const maintenant = new Date().toISOString();
  await supabase.from("entreprises").update({ offres_verifiees_at: maintenant }).eq("id", entreprise.id).eq("user_id", user.id);

  return NextResponse.json({
    offres,
    liens: liensRecherche(entreprise.nom, posteVise || "", entreprise.site_web ?? entreprise.fiche?.site_web ?? null),
    sources: { base: baseLue, france_travail: franceTravailLue },
    verifiees_at: maintenant,
  });
}
