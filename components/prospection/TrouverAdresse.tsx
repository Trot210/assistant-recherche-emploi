"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { libelleVerification } from "@/lib/hunter/verification";
import { liensPersonnes } from "@/lib/prospection/offres";
import type { EmailVerification } from "@/types/database.types";
import type { ContactEntreprise, Entreprise } from "@/types/prospection";

interface Candidat {
  email: string;
  patron: string;
  verification: EmailVerification | null;
  deja_connu: boolean;
}

interface Resultat {
  domaine: string;
  format: { patron: string; observations: number; total: number } | null;
  patron_hunter: string | null;
  candidats: Candidat[];
  verifications_restantes: number | null;
  verification_indisponible: string | null;
}

interface Props {
  userId: string;
  entreprise: Entreprise;
  onContactAjoute: (contact: ContactEntreprise) => void;
}

// Retrouve l'adresse d'une personne dont tu connais le nom : le format des
// adresses de l'entreprise est déduit de celles déjà connues, puis vérifié.
export default function TrouverAdresse({ userId, entreprise, onContactAjoute }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [poste, setPoste] = useState("");
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ajoutes, setAjoutes] = useState<Set<string>>(new Set());

  async function deviner() {
    setEnCours(true);
    setErreur(null);
    setResultat(null);
    try {
      const res = await fetch(`/api/prospection/entreprises/${entreprise.id}/deviner-adresse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prenom, nom }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la recherche");
      setResultat(data as Resultat);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de la recherche");
    } finally {
      setEnCours(false);
    }
  }

  async function ajouter(c: Candidat) {
    if (!resultat) return;
    setErreur(null);
    const format = `format ${c.patron} du domaine ${resultat.domaine}`;
    const { data, error } = await supabase
      .from("contacts")
      .insert({
        user_id: userId,
        entreprise_id: entreprise.id,
        nom: `${prenom.trim()} ${nom.trim()}`,
        poste: poste.trim() || null,
        email: c.email,
        origine: "devine",
        source_email: `Adresse déduite du ${format}${c.verification === "valide" ? ", vérifiée par Hunter.io" : ""}`,
        email_verification: c.verification,
        email_verifie_at: c.verification ? new Date().toISOString() : null,
      })
      .select()
      .single();
    if (error) return setErreur(error.message);
    onContactAjoute(data);
    setAjoutes((a) => new Set(a).add(c.email));
  }

  return (
    <div>
      <div className="filter-group-label" style={{ marginBottom: 6 }}>
        Trouver l&apos;adresse d&apos;une personne
      </div>
      <p className="prospection-meta" style={{ marginBottom: 8 }}>
        Trouve le nom d&apos;un responsable (
        {liensPersonnes(entreprise.nom).map((l, i) => (
          <span key={l.url}>
            {i > 0 && " · "}
            <a href={l.url} target="_blank" rel="noopener noreferrer">
              {l.libelle}
            </a>
          </span>
        ))}
        ), puis saisis-le ici : le site déduit son adresse et la vérifie.
      </p>
      <div className="prospection-contact-form">
        <input type="text" placeholder="Prénom *" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
        <input type="text" placeholder="Nom *" value={nom} onChange={(e) => setNom(e.target.value)} />
        <input type="text" placeholder="Poste (facultatif)" value={poste} onChange={(e) => setPoste(e.target.value)} />
      </div>
      <button className="action-btn" style={{ marginTop: 8 }} onClick={deviner} disabled={enCours || !prenom.trim() || !nom.trim()}>
        {enCours ? "Recherche et vérification..." : "Deviner et vérifier l'adresse"}
      </button>
      {erreur && <p className="prospection-erreur" style={{ marginTop: 8 }}>{erreur}</p>}

      {resultat && (
        <div style={{ marginTop: 10 }}>
          <p className="prospection-meta">
            {resultat.format
              ? `Format observé chez ${resultat.domaine} : ${resultat.format.patron} (${resultat.format.observations} adresse(s) connue(s) sur ${resultat.format.total}).`
              : resultat.patron_hunter
                ? `Format indiqué par Hunter pour ${resultat.domaine} : ${resultat.patron_hunter}.`
                : `Aucun format connu pour ${resultat.domaine} : les formats les plus courants sont essayés.`}
            {resultat.verifications_restantes !== null && ` Vérifications Hunter restantes ce mois-ci : ${resultat.verifications_restantes}.`}
          </p>
          {resultat.verification_indisponible && (
            <p className="prospection-erreur" style={{ marginTop: 4 }}>{resultat.verification_indisponible}</p>
          )}
          {resultat.candidats.map((c) => (
            <div key={c.email} className="prospection-contact">
              <span>
                <b>{c.email}</b>
                <span className={c.verification === "invalide" ? "prospection-erreur" : "prospection-meta"}>
                  {" "}
                  — {c.deja_connu ? "déjà dans tes contacts" : libelleVerification(c.verification)}
                </span>
              </span>
              <button
                className="prospection-link-btn"
                onClick={() => ajouter(c)}
                disabled={c.deja_connu || c.verification === "invalide" || ajoutes.has(c.email)}
              >
                {ajoutes.has(c.email) ? "Ajoutée" : "Ajouter ce contact"}
              </button>
            </div>
          ))}
          {resultat.candidats.every((c) => c.verification === null || c.verification === "invalide") && !resultat.verification_indisponible && (
            <p className="prospection-meta" style={{ marginTop: 6 }}>
              Aucune adresse confirmée : vérifie le nom, ou ajoute le contact à la main s&apos;il t&apos;a donné son adresse.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
