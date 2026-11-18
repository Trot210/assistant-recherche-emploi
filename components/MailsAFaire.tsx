"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formaterDateFr } from "@/lib/prospection/dates";
import type { FicheEntretien } from "@/lib/prospection/fiche-entretien";
import { entretiensRecents, mailsAFaire, type LigneCourrierBrute } from "@/lib/prospection/mails-a-faire";

// Deux blocs d'« Aujourd'hui » tirés du tri des mails de candidature : les invitations à un entretien (rangées dans
// « Entretiens », étoilées) et les mails qui demandent une action de ta part. Lecture seule sur la boîte mail : ce
// composant ne lit que la mémoire du tri, déjà en base.
export default function MailsAFaire() {
  const supabase = useMemo(() => createClient(), []);
  const [lignes, setLignes] = useState<(LigneCourrierBrute & { id: string })[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  // Fiches d'entretien rédigées depuis l'ouverture de la page, et préparation en cours.
  const [fiches, setFiches] = useState<Record<string, FicheEntretien>>({});
  const [preparation, setPreparation] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const depuis = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const colonnes = "id, nature, expediteur, sujet, resume, date_mail, action_requise, action_texte, action_lien, action_faite_at";
    const lire = (liste: string) =>
      supabase
        .from("courrier_candidatures")
        .select(liste)
        .or("nature.eq.entretien,action_requise.eq.true")
        .gte("date_mail", depuis)
        .order("date_mail", { ascending: false })
        .limit(100);
    // La fiche d'entretien vient de la migration 0028 : sans elle, on relit sans cette colonne.
    let res = await lire(`${colonnes}, fiche_entretien`);
    if (res.error) res = await lire(colonnes);
    // Colonnes absentes (migration 0027 pas encore appliquée) : on n'affiche simplement rien.
    if (res.error) return;
    setLignes((res.data ?? []) as unknown as (LigneCourrierBrute & { id: string })[]);
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  const aFaire = mailsAFaire(lignes);
  const entretiens = entretiensRecents(lignes);

  async function marquerFait(id: string | null) {
    if (!id) return;
    setErreur(null);
    const { error } = await supabase.from("courrier_candidatures").update({ action_faite_at: new Date().toISOString() }).eq("id", id);
    if (error) setErreur(error.message);
    else await charger();
  }

  async function preparerEntretien(id: string | null) {
    if (!id) return;
    setErreur(null);
    setPreparation(id);
    try {
      const res = await fetch("/api/entretiens/preparer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setFiches((f) => ({ ...f, [id]: data.fiche as FicheEntretien }));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
    } finally {
      setPreparation(null);
    }
  }

  if (aFaire.length === 0 && entretiens.length === 0) return null;

  return (
    <>
      {entretiens.length > 0 && (
        <div className="prospection-bloc">
          <h3>Entretiens ({entretiens.length})</h3>
          {erreur && <p className="prospection-erreur">{erreur}</p>}
          <div className="prospection-liste">
            {entretiens.map((e, i) => (
              <div key={`${e.sujet}-${i}`} className="prospection-ligne due">
                <div className="prospection-titre">
                  {e.expediteur} — {e.sujet}
                </div>
                <div className="prospection-meta">
                  {e.date ? `Reçu le ${formaterDateFr(e.date.slice(0, 10))} · ` : ""}
                  {e.resume} · dossier « Entretiens », étoilé
                </div>
                <FicheAffichee fiche={(e.id ? fiches[e.id] : undefined) ?? e.fiche} />
                {e.id && !(fiches[e.id] ?? e.fiche) && (
                  <div style={{ marginTop: 6 }}>
                    <button type="button" className="action-btn" disabled={preparation !== null} onClick={() => preparerEntretien(e.id)}>
                      {preparation === e.id ? "Préparation..." : "Préparer l'entretien"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {aFaire.length > 0 && (
        <div className="prospection-bloc">
          <h3>À faire dans mes mails ({aFaire.length})</h3>
          {erreur && <p className="prospection-erreur">{erreur}</p>}
          <div className="prospection-liste">
            {aFaire.map((m, i) => (
              <div key={m.id ?? i} className="prospection-ligne due">
                <div className="prospection-titre">
                  {m.expediteur} — {m.action}
                </div>
                <div className="prospection-meta">
                  {m.sujet}
                  {m.date ? ` · reçu le ${formaterDateFr(m.date.slice(0, 10))}` : ""}
                </div>
                <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {m.lien && (
                    <a href={m.lien} target="_blank" rel="noopener noreferrer" className="action-btn primary">
                      Ouvrir le lien
                    </a>
                  )}
                  <button type="button" className="action-btn" onClick={() => marquerFait(m.id)}>
                    Fait
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// Fiche de préparation d'un entretien : repliée par défaut pour ne pas allonger la page.
function FicheAffichee({ fiche }: { fiche: FicheEntretien | null | undefined }) {
  if (!fiche) return null;
  const liste = (titre: string, elements: string[]) =>
    elements.length > 0 && (
      <div style={{ marginTop: 6 }}>
        <strong>{titre}</strong>
        <ul style={{ margin: "2px 0 0 18px" }}>
          {elements.map((el) => (
            <li key={el}>{el}</li>
          ))}
        </ul>
      </div>
    );
  return (
    <details style={{ marginTop: 6 }}>
      <summary style={{ cursor: "pointer" }}>Ma fiche de préparation</summary>
      {fiche.resume && <p className="prospection-meta">{fiche.resume}</p>}
      {liste("Infos pratiques (d'après le mail)", fiche.infos_pratiques)}
      {liste("À vérifier", fiche.a_verifier)}
      {liste("Questions probables", fiche.questions_probables)}
      {liste("Mes points forts à mettre en avant", fiche.points_forts)}
      {liste("Questions à poser", fiche.questions_a_poser)}
    </details>
  );
}
