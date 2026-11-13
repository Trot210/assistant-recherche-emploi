"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formaterDateFr } from "@/lib/prospection/dates";
import { entretiensRecents, mailsAFaire, type LigneCourrierBrute } from "@/lib/prospection/mails-a-faire";

// Deux blocs d'« Aujourd'hui » tirés du tri des mails de candidature : les invitations à un entretien (rangées dans
// « Entretiens », étoilées) et les mails qui demandent une action de ta part. Lecture seule sur la boîte mail : ce
// composant ne lit que la mémoire du tri, déjà en base.
export default function MailsAFaire() {
  const supabase = useMemo(() => createClient(), []);
  const [lignes, setLignes] = useState<(LigneCourrierBrute & { id: string })[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const depuis = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data, error } = await supabase
      .from("courrier_candidatures")
      .select("id, nature, expediteur, sujet, resume, date_mail, action_requise, action_texte, action_lien, action_faite_at")
      .or("nature.eq.entretien,action_requise.eq.true")
      .gte("date_mail", depuis)
      .order("date_mail", { ascending: false })
      .limit(100);
    // Colonnes absentes (migration 0027 pas encore appliquée) : on n'affiche simplement rien.
    if (error) return;
    setLignes(data ?? []);
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

  if (aFaire.length === 0 && entretiens.length === 0) return null;

  return (
    <>
      {entretiens.length > 0 && (
        <div className="prospection-bloc">
          <h3>Entretiens ({entretiens.length})</h3>
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
