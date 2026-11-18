"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formaterDateFr } from "@/lib/prospection/dates";
import { calculerStatistiques, type Statistiques as Stats } from "@/lib/prospection/statistiques";
import { aujourdhuiParis } from "@/lib/prospection/workflow";

// Ce qui part, ce qui revient et en combien de temps, sur les huit dernières semaines. Lecture de la base
// seulement : aucun appel à Claude ni à la boîte mail.
export default function Statistiques() {
  const supabase = useMemo(() => createClient(), []);
  const [stats, setStats] = useState<Stats | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!ouvert || stats) return;
    let actif = true;
    (async () => {
      const [p, c, m] = await Promise.all([
        supabase.from("prospections").select("type, date_envoi, reponse_date, reponse_type").limit(2000),
        supabase.from("candidatures").select("statut, date_envoi").limit(2000),
        supabase.from("courrier_candidatures").select("nature, date_mail").limit(2000),
      ]);
      if (!actif) return;
      if (p.error || c.error) {
        setErreur((p.error ?? c.error)?.message ?? "Erreur");
        return;
      }
      // Le tri des mails peut être absent (migration pas appliquée) : on affiche alors le reste.
      setStats(calculerStatistiques({ prospections: p.data ?? [], candidatures: c.data ?? [], courrier: m.error ? [] : (m.data ?? []) }, aujourdhuiParis()));
    })();
    return () => {
      actif = false;
    };
  }, [ouvert, stats, supabase]);

  const maxSemaine = stats ? Math.max(1, ...stats.semaines.map((s) => Math.max(s.envois, s.accuses + s.refus + s.entretiens))) : 1;

  return (
    <div className="prospection-bloc">
      <h3>
        <button type="button" className="action-btn" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
          {ouvert ? "Masquer mes statistiques" : "Voir mes statistiques"}
        </button>
      </h3>
      {ouvert && erreur && <p className="prospection-erreur">{erreur}</p>}
      {ouvert && !stats && !erreur && <p className="prospection-meta">Chargement...</p>}
      {ouvert && stats && (
        <>
          <p className="prospection-meta">
            Depuis le début : {stats.total.envois} candidature{stats.total.envois > 1 ? "s" : ""} envoyée{stats.total.envois > 1 ? "s" : ""} ({stats.spontanees.envoyees} spontanée
            {stats.spontanees.envoyees > 1 ? "s" : ""}, {stats.offres.envoyees} sur offre), {stats.total.accuses} accusé{stats.total.accuses > 1 ? "s" : ""} de réception,{" "}
            {stats.total.refus} refus, {stats.total.entretiens} entretien{stats.total.entretiens > 1 ? "s" : ""}.
          </p>
          <p className="prospection-meta">
            Candidatures spontanées : {stats.spontanees.reponses} réponse{stats.spontanees.reponses > 1 ? "s" : ""}
            {stats.spontanees.tauxReponse !== null ? ` (${stats.spontanees.tauxReponse} %)` : ""}
            {stats.spontanees.delaiMoyenJours !== null ? `, délai moyen ${stats.spontanees.delaiMoyenJours} jour${stats.spontanees.delaiMoyenJours > 1 ? "s" : ""}` : ""}.
          </p>
          <div className="prospection-liste" style={{ marginTop: 10 }}>
            {stats.semaines.map((s) => {
              const retours = s.accuses + s.refus + s.entretiens;
              return (
                <div key={s.debut} className="prospection-ligne">
                  <div className="prospection-titre">Semaine du {formaterDateFr(s.debut)}</div>
                  <div className="prospection-meta">
                    {s.envois} envoi{s.envois > 1 ? "s" : ""} · {s.accuses} accusé{s.accuses > 1 ? "s" : ""} · {s.refus} refus · {s.entretiens} entretien{s.entretiens > 1 ? "s" : ""}
                  </div>
                  <div aria-hidden style={{ display: "grid", gap: 3, marginTop: 6 }}>
                    <div style={{ height: 6, width: `${(s.envois / maxSemaine) * 100}%`, minWidth: s.envois ? 4 : 0, background: "var(--navy)", borderRadius: 3 }} />
                    <div style={{ height: 6, width: `${(retours / maxSemaine) * 100}%`, minWidth: retours ? 4 : 0, background: "var(--emerald)", borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="prospection-meta" style={{ marginTop: 8 }}>
            Barre bleue : envois. Barre verte : mails reçus (accusés, refus, entretiens). Les mails triés ne couvrent que la période depuis le début du tri automatique.
          </p>
        </>
      )}
    </div>
  );
}
