"use client";

import { useCallback, useEffect, useState } from "react";

interface Reglages {
  relances_auto: boolean;
  recap_actif: boolean;
}

interface Apercu {
  nb_actions: number;
  nouvelles_reponses: number;
  recap: { sujet: string; texte: string } | null;
}

// Réglages du traitement du matin (relances préparées, récapitulatif par e-mail)
// et aperçu de ce qu'il dirait maintenant, sans rien rédiger ni envoyer.
export default function Automatisation() {
  const [reglages, setReglages] = useState<Reglages | null>(null);
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const res = await fetch("/api/quotas").catch(() => null);
    if (res?.ok) setReglages(((await res.json()) as { reglages: Reglages }).reglages);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function changer(cle: keyof Reglages, valeur: boolean) {
    setErreur(null);
    const avant = reglages;
    setReglages((r) => (r ? { ...r, [cle]: valeur } : r));
    const res = await fetch("/api/quotas", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [cle]: valeur }),
    });
    if (!res.ok) {
      setReglages(avant);
      setErreur((await res.json().catch(() => ({}))).error ?? "Erreur");
    }
  }

  async function voirApercu() {
    setEnCours(true);
    setErreur(null);
    try {
      const res = await fetch("/api/cron/quotidien", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulation: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setApercu(data as Apercu);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
    } finally {
      setEnCours(false);
    }
  }

  if (!reglages) return null;

  return (
    <div className="prospection-bloc" style={{ marginTop: 18 }}>
      <h3>Automatisation du matin</h3>
      <p className="prospection-meta" style={{ marginBottom: 8 }}>
        Chaque matin, le site prépare les brouillons des relances dues (3 au maximum), compte tes nouvelles réponses et
        t&apos;écrit un récapitulatif, à toi seul. Aucun message ne part vers une entreprise sans ta validation.
      </p>
      <label className="prospection-meta" style={{ display: "block" }}>
        <input type="checkbox" checked={reglages.relances_auto} onChange={(e) => changer("relances_auto", e.target.checked)} />{" "}
        Préparer les relances dues (utilise Claude, environ 2 centimes chacune)
      </label>
      <label className="prospection-meta" style={{ display: "block" }}>
        <input type="checkbox" checked={reglages.recap_actif} onChange={(e) => changer("recap_actif", e.target.checked)} />{" "}
        M&apos;envoyer le récapitulatif par e-mail (seulement s&apos;il y a quelque chose à faire)
      </label>
      <button className="action-btn" style={{ marginTop: 10 }} onClick={voirApercu} disabled={enCours}>
        {enCours ? "Calcul..." : "Voir l'aperçu du récapitulatif"}
      </button>
      {erreur && <p className="prospection-erreur" style={{ marginTop: 8 }}>{erreur}</p>}
      {apercu && (
        <div style={{ marginTop: 10 }}>
          {apercu.recap ? (
            <>
              <p className="prospection-meta">
                <b>{apercu.recap.sujet}</b>
              </p>
              <pre className="prospection-citation" style={{ whiteSpace: "pre-wrap" }}>{apercu.recap.texte}</pre>
            </>
          ) : (
            <p className="prospection-meta">Rien à signaler pour l&apos;instant : aucun e-mail ne serait envoyé.</p>
          )}
        </div>
      )}
    </div>
  );
}
