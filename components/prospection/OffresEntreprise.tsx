"use client";

import { useState } from "react";
import { formaterDateFr } from "@/lib/prospection/dates";
import type { Entreprise } from "@/types/prospection";
import type { VerificationOffres } from "@/types/offres-entreprise";

interface Props {
  entreprise: Entreprise;
  verification: VerificationOffres | null;
  enCours: boolean;
  // Une offre correspondante existe : la rédaction a été suspendue.
  bloquant: boolean;
  onVerifier: () => void;
  onEcrireQuandMeme: () => void;
  onEnregistrerOffreReperee: (titre: string, url: string) => Promise<void>;
}

// Offres déjà publiées par l'entreprise, à regarder AVANT d'écrire : si elle
// recrute sur le poste, mieux vaut postuler à l'offre qu'envoyer un message à froid.
export default function OffresEntreprise({
  entreprise,
  verification,
  enCours,
  bloquant,
  onVerifier,
  onEcrireQuandMeme,
  onEnregistrerOffreReperee,
}: Props) {
  const [titre, setTitre] = useState(entreprise.offre_reperee_titre ?? "");
  const [url, setUrl] = useState(entreprise.offre_reperee_url ?? "");
  const [suivies, setSuivies] = useState<Record<string, "encours" | "ok" | string>>({});
  const [erreur, setErreur] = useState<string | null>(null);

  async function suivre(offreId: string) {
    setSuivies((s) => ({ ...s, [offreId]: "encours" }));
    try {
      const res = await fetch("/api/candidatures", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offre_id: offreId, statut: "a_traiter" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setSuivies((s) => ({ ...s, [offreId]: "ok" }));
    } catch (e) {
      setSuivies((s) => ({ ...s, [offreId]: e instanceof Error ? e.message : "Erreur" }));
    }
  }

  async function enregistrer() {
    const urlPropre = url.trim();
    if (urlPropre) {
      try {
        const u = new URL(urlPropre);
        if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("protocole");
      } catch {
        return setErreur("Lien invalide : colle l'adresse complète de l'offre (https://...)");
      }
    }
    setErreur(null);
    await onEnregistrerOffreReperee(titre.trim(), urlPropre);
  }

  const reperee = entreprise.offre_reperee_url || entreprise.offre_reperee_titre;

  return (
    <div className="prospection-bloc">
      <div className="filter-group-label" style={{ marginBottom: 6 }}>
        Offres publiées par l&apos;entreprise
      </div>

      {bloquant && (
        <p className="prospection-erreur" style={{ marginBottom: 8 }}>
          Cette entreprise a déjà publié une offre qui correspond. La rédaction est suspendue : postule plutôt à l&apos;offre,
          ou écris quand même.
        </p>
      )}

      <div className="prospection-actions">
        <button className="action-btn" onClick={onVerifier} disabled={enCours}>
          {enCours ? "Recherche..." : verification ? "Revérifier les offres" : "Chercher les offres publiées"}
        </button>
        {bloquant && (
          <button className="action-btn primary" onClick={onEcrireQuandMeme} disabled={enCours}>
            Écrire quand même
          </button>
        )}
        {!verification && entreprise.offres_verifiees_at && (
          <span className="prospection-meta">Vérifié le {formaterDateFr(entreprise.offres_verifiees_at.slice(0, 10))}</span>
        )}
      </div>

      {reperee && (
        <p className="prospection-info" style={{ marginTop: 8 }}>
          Offre repérée par toi :{" "}
          {entreprise.offre_reperee_url ? (
            <a href={entreprise.offre_reperee_url} target="_blank" rel="noopener noreferrer">
              {entreprise.offre_reperee_titre || entreprise.offre_reperee_url}
            </a>
          ) : (
            entreprise.offre_reperee_titre
          )}
        </p>
      )}

      {verification && (
        <div style={{ marginTop: 10 }}>
          {verification.offres.length === 0 ? (
            <p className="prospection-meta">
              Aucune offre correspondante trouvée dans {verification.sources.base ? "ta base" : "ta base (indisponible)"}
              {verification.sources.france_travail ? " et sur France Travail" : " (France Travail indisponible)"}. Cette recherche
              est partielle : regarde aussi LinkedIn et le site carrières avec les liens ci-dessous.
            </p>
          ) : (
            verification.offres.map((o) => {
              const etat = o.offreId ? suivies[o.offreId] : undefined;
              return (
                <div key={`${o.source}-${o.lien ?? o.titre}`} className="prospection-contact">
                  <span>
                    {o.lien ? (
                      <a href={o.lien} target="_blank" rel="noopener noreferrer">
                        <b>{o.titre}</b>
                      </a>
                    ) : (
                      <b>{o.titre}</b>
                    )}
                    <span className="prospection-meta">
                      {" "}
                      — {[o.employeur, o.lieu, o.date ? formaterDateFr(o.date) : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {o.offreId && (
                    <button className="prospection-link-btn" onClick={() => suivre(o.offreId!)} disabled={etat === "encours" || etat === "ok"}>
                      {etat === "ok" ? "Ajoutée au suivi" : "Ajouter à mon suivi"}
                    </button>
                  )}
                  {etat && etat !== "ok" && etat !== "encours" && <span className="prospection-erreur">{etat}</span>}
                </div>
              );
            })
          )}
          <p className="prospection-meta" style={{ marginTop: 8 }}>
            Chercher à la main :{" "}
            {verification.liens.map((l, i) => (
              <span key={l.url}>
                {i > 0 && " · "}
                <a href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.libelle}
                </a>
              </span>
            ))}
          </p>
        </div>
      )}

      <div className="prospection-contact-form" style={{ marginTop: 10 }}>
        <input type="text" placeholder="Offre repérée : intitulé" value={titre} onChange={(e) => setTitre(e.target.value)} />
        <input type="text" placeholder="Lien de l'offre" value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>
      <button className="action-btn" style={{ marginTop: 8 }} onClick={enregistrer}>
        Enregistrer l&apos;offre repérée
      </button>
      {erreur && <p className="prospection-erreur" style={{ marginTop: 8 }}>{erreur}</p>}
    </div>
  );
}
