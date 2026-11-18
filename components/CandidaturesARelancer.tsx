"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formaterDateFr } from "@/lib/prospection/dates";
import { lireCandidaturesARelancer, type CandidatureARelancer } from "@/lib/prospection/relance-candidature";

interface Brouillon {
  objet: string;
  corps: string;
}

// Candidatures sur offres sans nouvelles depuis 10 à 30 jours : un brouillon de relance se prépare d'un clic
// (environ un demi-centime). Le texte s'affiche pour que tu l'envoies toi-même ; rien ne part du site.
export default function CandidaturesARelancer() {
  const supabase = useMemo(() => createClient(), []);
  const [liste, setListe] = useState<CandidatureARelancer[]>([]);
  const [brouillons, setBrouillons] = useState<Record<string, Brouillon>>({});
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    setListe(await lireCandidaturesARelancer(supabase, data.user.id));
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function preparer(id: string) {
    setEnCours(id);
    setErreur(null);
    try {
      const res = await fetch("/api/candidatures/relance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidature_id: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setBrouillons((b) => ({ ...b, [id]: data.relance as Brouillon }));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
    } finally {
      setEnCours(null);
    }
  }

  // « C'est fait » et « Pas de relance » enregistrent la même chose : la candidature ne sera plus proposée.
  async function classer(id: string) {
    setErreur(null);
    const { error } = await supabase.from("candidatures").update({ derniere_relance_at: new Date().toISOString() }).eq("id", id);
    if (error) setErreur(`Impossible d'enregistrer (migration 0028 appliquée ?) : ${error.message}`);
    else await charger();
  }

  async function copier(id: string, texte: string) {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(id);
      setTimeout(() => setCopie((c) => (c === id ? null : c)), 2000);
    } catch {
      setErreur("Copie impossible : sélectionne le texte à la main.");
    }
  }

  if (liste.length === 0) return null;

  return (
    <div className="prospection-bloc">
      <h3>Candidatures sans nouvelles ({liste.length})</h3>
      {erreur && <p className="prospection-erreur">{erreur}</p>}
      <div className="prospection-liste">
        {liste.map((c) => {
          const brouillon = brouillons[c.id];
          return (
            <div key={c.id} className="prospection-ligne">
              <div className="prospection-titre">
                {c.entreprise} — {c.titre}
              </div>
              <div className="prospection-meta">
                Envoyée le {formaterDateFr(c.envoyeLe)} · {c.jours} jours sans nouvelles
              </div>
              {brouillon && (
                <div style={{ marginTop: 8 }}>
                  <p className="prospection-meta">Objet : {brouillon.objet}</p>
                  <textarea readOnly value={brouillon.corps} rows={8} style={{ width: "100%", marginTop: 4 }} aria-label="Brouillon de relance" />
                </div>
              )}
              <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {!brouillon ? (
                  <button type="button" className="action-btn primary" disabled={enCours !== null} onClick={() => preparer(c.id)}>
                    {enCours === c.id ? "Rédaction..." : "Préparer un brouillon de relance"}
                  </button>
                ) : (
                  <button type="button" className="action-btn primary" onClick={() => copier(c.id, `${brouillon.objet}\n\n${brouillon.corps}`)}>
                    {copie === c.id ? "Copié" : "Copier le texte"}
                  </button>
                )}
                {c.lien && (
                  <a href={c.lien} target="_blank" rel="noopener noreferrer" className="action-btn">
                    Ouvrir l&apos;offre
                  </a>
                )}
                <button type="button" className="action-btn" onClick={() => classer(c.id)}>
                  {brouillon ? "C'est fait" : "Pas de relance"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
