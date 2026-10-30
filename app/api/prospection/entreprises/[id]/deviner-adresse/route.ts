import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hunterConfigure, lireQuotaHunter, QuotaHunterEpuise, verifierEmail } from "@/lib/hunter/client";
import { candidatsAdresses, deduireFormat, domaineAdresses, patronDepuisHunter } from "@/lib/prospection/adresses";
import { extraireDomaine } from "@/lib/prospection/fiche";
import type { EmailVerification } from "@/types/database.types";

const NOM_VALIDE = /^[\p{L}][\p{L}' -]{0,59}$/u;

// Devine l'adresse d'une personne dont on connaît le nom (trouvé sur LinkedIn ou
// le site de l'entreprise) : format déduit des adresses connues du domaine, puis
// vérification par Hunter des quelques candidats. Rien n'est enregistré ici :
// l'utilisateur choisit ensuite d'ajouter le contact. Aucun appel à Claude.
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
  const prenom = typeof corps?.prenom === "string" ? corps.prenom.trim() : "";
  const nom = typeof corps?.nom === "string" ? corps.nom.trim() : "";
  if (!NOM_VALIDE.test(prenom) || !NOM_VALIDE.test(nom)) {
    return NextResponse.json({ error: "Saisis le prénom et le nom (lettres uniquement)" }, { status: 400 });
  }

  const { data: entreprise, error } = await supabase
    .from("entreprises")
    .select()
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!entreprise) return NextResponse.json({ error: "Entreprise introuvable" }, { status: 404 });

  const { data: contacts } = await supabase
    .from("contacts")
    .select("nom, email, generique")
    .eq("entreprise_id", entreprise.id)
    .eq("user_id", user.id);

  const connues = (contacts ?? [])
    .filter((c): c is { nom: string; email: string; generique: boolean } => Boolean(c.email))
    .map((c) => ({ nom: c.nom, email: c.email, generique: c.generique }));

  const domaine = domaineAdresses(connues, extraireDomaine(entreprise.site_web ?? entreprise.fiche?.site_web));
  if (!domaine) {
    return NextResponse.json({ error: "Domaine inconnu : renseigne le site de l'entreprise ou ajoute une adresse connue" }, { status: 400 });
  }

  const format = deduireFormat(connues, domaine);
  const patronHunter = patronDepuisHunter(entreprise.fiche?.hunter_pattern);
  const candidats = candidatsAdresses({ prenom, nom, domaine, format, patronHunter });
  const dejaConnues = new Set(connues.map((c) => c.email.toLowerCase()));

  const resultats: { email: string; patron: string; verification: EmailVerification | null; deja_connu: boolean }[] = candidats.map((c) => ({
    email: c.email,
    patron: c.patron,
    verification: null,
    deja_connu: dejaConnues.has(c.email),
  }));

  // Vérification : on s'arrête à la première adresse confirmée, et dès qu'un
  // serveur accepte tout (les autres essais ne prouveraient rien).
  let verificationsRestantes: number | null = null;
  let verificationIndisponible: string | null = null;
  if (!hunterConfigure()) {
    verificationIndisponible = "Hunter n'est pas configuré : les adresses proposées ne sont pas vérifiées.";
  } else {
    try {
      const quota = await lireQuotaHunter();
      verificationsRestantes = quota.verifications.disponibles - quota.verifications.utilisees;
      for (const r of resultats) {
        if (verificationsRestantes <= 0) {
          verificationIndisponible = "Quota de vérifications Hunter épuisé ce mois-ci : les adresses suivantes ne sont pas vérifiées.";
          break;
        }
        r.verification = await verifierEmail(r.email);
        verificationsRestantes -= 1;
        if (r.verification === "valide" || r.verification === "accept_all") break;
      }
    } catch (e) {
      verificationIndisponible =
        e instanceof QuotaHunterEpuise ? e.message : `Vérification impossible : ${e instanceof Error ? e.message : "erreur inconnue"}`;
    }
  }

  return NextResponse.json({
    domaine,
    format: format ? { patron: format.patron, observations: format.observations, total: format.total } : null,
    patron_hunter: patronHunter,
    candidats: resultats,
    verifications_restantes: verificationsRestantes,
    verification_indisponible: verificationIndisponible,
  });
}
