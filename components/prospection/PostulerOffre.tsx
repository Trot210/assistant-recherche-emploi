"use client";

import { useState } from "react";
import { formaterDateFr } from "@/lib/prospection/dates";
import type { OffreTrouvee } from "@/lib/prospection/offres";
import type { VerificationOffres } from "@/types/offres-entreprise";

interface Props {
  prospectionId: string;
  entrepriseId: string;
  posteVise: string;
  // Liens écrits dans la réponse de l'entreprise (site carrières, offre).
  liensReponse: string[];
}

type Etat = { enCours: boolean; offreId: string | null; erreur: string | null };

// À la suite d'une réponse « postule sur notre site » : retrouver l'offre, l'ajouter
// dans « Offres » (où l'on prépare CV et lettre adaptés). Rien n'est envoyé ni postulé
// d'ici, et aucun appel à Claude n'est fait.
export default function PostulerOffre({ prospectionId, entrepriseId, posteVise, liensReponse }: Props) {
  const [verification, setVerification] = useState<VerificationOffres | null>(null);
  const [recherche, setRecherche] = useState({ enCours: false, erreur: null as string | null });
  const [etats, setEtats] = useState<Record<string, Etat>>({});
  const [manuelOuvert, setManuelOuvert] = useState(false);
  const [titre, setTitre] = useState("");
  const [lien, setLien] = useState(liensReponse[0] ?? "");
  const [description, setDescription] = useState("");

  async function chercher() {
    setRecherche({ enCours: true, erreur: null });
    try {
      const res = await fetch(`/api/prospection/entreprises/${entrepriseId}/offres`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poste_vise: posteVise }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la recherche");
      setVerification(data as VerificationOffres);
      setRecherche({ enCours: false, erreur: null });
    } catch (e) {
      setRecherche({ enCours: false, erreur: e instanceof Error ? e.message : "Erreur lors de la recherche" });
    }
  }

  async function ajouter(cle: string, saisie: { titre: string; lien: string; description?: string | null; localisation?: string | null }) {
    setEtats((s) => ({ ...s, [cle]: { enCours: true, offreId: null, erreur: null } }));
    try {
      const res = await fetch(`/api/prospection/${prospectionId}/offre-candidature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saisie),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de l'ajout");
      setEtats((s) => ({ ...s, [cle]: { enCours: false, offreId: data.offre_id as string, erreur: null } }));
    } catch (e) {
      setEtats((s) => ({ ...s, [cle]: { enCours: false, offreId: null, erreur: e instanceof Error ? e.message : "Erreur lors de l'ajout" } }));
    }
  }

  function preparer(o: OffreTrouvee, cle: string) {
    // Déjà dans « Offres » : rien à créer, on ouvre directement.
    if (o.offreId) return setEtats((s) => ({ ...s, [cle]: { enCours: false, offreId: o.offreId, erreur: null } }));
    if (!o.lien) return setEtats((s) => ({ ...s, [cle]: { enCours: false, offreId: null, erreur: "Cette offre n'a pas de lien : ajoute-la à la main ci-dessous." } }));
    return ajouter(cle, { titre: o.titre, lien: o.lien, description: o.description ?? null, localisation: o.lieu });
  }

  const lienOuvrir = (offreId: string) => (
    <a className="action-btn primary" style={{ textDecoration: "none" }} href={`/offres?offre=${offreId}`} target="_blank" rel="noopener noreferrer">
      Ouvrir l&apos;offre : CV et lettre
    </a>
  );

  return (
    <div>
      <div className="filter-group-label" style={{ marginBottom: 2 }}>
        Postuler à une offre
      </div>
      <p className="prospection-meta" style={{ margin: "0 0 6px" }}>
        L&apos;offre est ajoutée dans « Offres » pour y préparer un CV et une lettre adaptés. Rien n&apos;est envoyé d&apos;ici.
      </p>

      <div className="prospection-actions">
        <button className="action-btn" onClick={chercher} disabled={recherche.enCours}>
          {recherche.enCours ? "Recherche..." : verification ? "Chercher de nouveau" : "Chercher les offres de l'entreprise"}
        </button>
        <button className="action-btn" onClick={() => setManuelOuvert((v) => !v)}>
          {manuelOuvert ? "Masquer" : "Ajouter une offre à la main"}
        </button>
      </div>
      {recherche.erreur && <p className="prospection-erreur" style={{ marginTop: 6 }}>{recherche.erreur}</p>}

      {verification && (
        <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
          {verification.offres.length === 0 && (
            <p className="prospection-meta" style={{ margin: 0 }}>
              Aucune offre correspondante trouvée dans ta base ni sur France Travail
              {verification.sources.france_travail ? "" : " (France Travail n'a pas pu être interrogé)"}. LinkedIn et les autres sites ne
              sont pas interrogés : utilise les liens ci-dessous.
            </p>
          )}
          {verification.offres.map((o, i) => {
            const cle = `o${i}`;
            const etat = etats[cle];
            return (
              <div key={cle} className="prospection-ligne" style={{ padding: 10 }}>
                <div className="prospection-titre" style={{ fontSize: 16 }}>{o.titre}</div>
                <div className="prospection-meta">
                  {[o.lieu, o.date ? `publiée le ${formaterDateFr(o.date)}` : null, o.source === "base" ? "déjà dans tes offres" : "France Travail"]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <div className="prospection-actions" style={{ marginTop: 6 }}>
                  {o.lien && (
                    <a className="action-btn" style={{ textDecoration: "none" }} href={o.lien} target="_blank" rel="noopener noreferrer">
                      Voir l&apos;annonce
                    </a>
                  )}
                  {etat?.offreId ? (
                    lienOuvrir(etat.offreId)
                  ) : (
                    <button className="action-btn primary" onClick={() => preparer(o, cle)} disabled={etat?.enCours}>
                      {etat?.enCours ? "Ajout..." : "Préparer ma candidature"}
                    </button>
                  )}
                </div>
                {etat?.erreur && <p className="prospection-erreur" style={{ marginTop: 4 }}>{etat.erreur}</p>}
              </div>
            );
          })}
          <div className="prospection-meta">
            Chercher aussi sur :{" "}
            {verification.liens.map((l, i) => (
              <span key={l.url}>
                {i > 0 && " · "}
                <a href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.libelle}
                </a>
              </span>
            ))}
          </div>
        </div>
      )}

      {(manuelOuvert || liensReponse.length > 0) && (
        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
          {liensReponse.length > 0 && (
            <p className="prospection-meta" style={{ margin: 0 }}>
              Lien indiqué dans la réponse :{" "}
              <a href={liensReponse[0]} target="_blank" rel="noopener noreferrer">
                {liensReponse[0]}
              </a>
            </p>
          )}
          {manuelOuvert && (
            <>
              <label>
                Intitulé de l&apos;offre
                <input type="text" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="ex : Category Manager Beauté" />
              </label>
              <label>
                Lien de l&apos;offre
                <input type="text" value={lien} onChange={(e) => setLien(e.target.value)} placeholder="https://..." />
              </label>
              <label>
                Texte de l&apos;annonce (facultatif, mais le CV adapté sera plus précis)
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
              </label>
              <div className="prospection-actions">
                {etats.manuel?.offreId ? (
                  lienOuvrir(etats.manuel.offreId)
                ) : (
                  <button className="action-btn primary" onClick={() => ajouter("manuel", { titre, lien, description: description || null })} disabled={etats.manuel?.enCours}>
                    {etats.manuel?.enCours ? "Ajout..." : "Ajouter à mes offres"}
                  </button>
                )}
              </div>
              {etats.manuel?.erreur && <p className="prospection-erreur">{etats.manuel.erreur}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
