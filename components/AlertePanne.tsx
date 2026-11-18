"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { diagnostiquerSante } from "@/lib/prospection/sante";

// Bandeau affiché seulement quand l'automatisation des mails semble en panne (plus de passage depuis plus d'une
// heure, ou erreur au dernier passage). Sans trace enregistrée (migration 0028 pas appliquée), rien ne s'affiche.
export default function AlertePanne() {
  const supabase = useMemo(() => createClient(), []);
  const [alertes, setAlertes] = useState<string[]>([]);

  useEffect(() => {
    let actif = true;
    supabase
      .from("reglages")
      .select("courrier_passage_at, courrier_passage_erreur")
      .maybeSingle()
      .then(({ data, error }) => {
        if (!actif || error || !data) return;
        setAlertes(diagnostiquerSante({ dernierPassage: data.courrier_passage_at, derniereErreur: data.courrier_passage_erreur }));
      });
    return () => {
      actif = false;
    };
  }, [supabase]);

  if (alertes.length === 0) return null;
  return (
    <div className="prospection-bloc" role="alert" style={{ borderColor: "var(--brick)", background: "var(--brick-bg)" }}>
      <h3>Automatisation : à vérifier</h3>
      {alertes.map((a) => (
        <p key={a} className="prospection-erreur">
          {a}
        </p>
      ))}
      <p className="prospection-meta">Si cela dure, vérifie la connexion à ta boîte mail (mot de passe d&apos;application Gmail) et les tâches planifiées de Supabase.</p>
    </div>
  );
}
