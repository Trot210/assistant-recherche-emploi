"use client";

import { useCallback, useEffect, useState } from "react";

interface Reglages {
  relances_auto: boolean;
  recap_actif: boolean;
}

interface LigneClassement {
  sens: "recu" | "envoye";
  entreprise: string;
  detail: string;
  date: string | null;
}

interface ResultatClassement {
  apercu: boolean;
  dossier: string;
  nbRecus: number;
  nbEnvoyes: number;
  lignes: LigneClassement[];
  bilan: { dossierCree: boolean; copies: number; deplaces: number; ajoutes: number; introuvables: number; erreurs: string[] } | null;
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
  // Dossier « Prospection » : aperçu de la reprise de l'existant, puis classement.
  const [classement, setClassement] = useState<ResultatClassement | null>(null);
  const [classementEnCours, setClassementEnCours] = useState(false);
  const [erreurClassement, setErreurClassement] = useState<string | null>(null);

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

  async function classer(apercu: boolean) {
    setClassementEnCours(true);
    setErreurClassement(null);
    try {
      const res = await fetch("/api/prospection/classement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apercu }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setClassement(data as ResultatClassement);
    } catch (e) {
      setErreurClassement(e instanceof Error ? e.message : "Erreur");
    } finally {
      setClassementEnCours(false);
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
      <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
        <h3 style={{ marginBottom: 6 }}>Dossier « Prospection 🥶 » dans ta boîte mail</h3>
        <p className="prospection-meta" style={{ marginBottom: 8 }}>
          Chaque message que le site envoie y est copié (il reste aussi dans « Envoyés »), et les réponses des entreprises y sont déplacées
          hors de ta boîte de réception, toutes les dix minutes environ. Seuls les messages rattachés à une candidature sont touchés ; rien
          n&apos;est supprimé. Ici : reprendre ce qui existe déjà.
        </p>
        <div className="prospection-actions">
          <button className="action-btn" onClick={() => classer(true)} disabled={classementEnCours}>
            {classementEnCours && !classement ? "Lecture de la boîte..." : "Voir ce qui serait classé"}
          </button>
          {classement?.apercu && (classement.nbRecus > 0 || classement.nbEnvoyes > 0) && (
            <button className="action-btn primary" onClick={() => classer(false)} disabled={classementEnCours}>
              {classementEnCours ? "Classement..." : `Classer maintenant (${classement.nbEnvoyes} envoyé(s), ${classement.nbRecus} réponse(s))`}
            </button>
          )}
        </div>
        {erreurClassement && <p className="prospection-erreur" style={{ marginTop: 8 }}>{erreurClassement}</p>}
        {classement && (
          <div style={{ marginTop: 10 }}>
            {classement.apercu ? (
              <p className="prospection-meta">
                À classer : {classement.nbEnvoyes} message(s) envoyé(s) à copier, {classement.nbRecus} réponse(s) à déplacer hors de la boîte de
                réception.
              </p>
            ) : (
              <p className="prospection-info">
                {classement.bilan
                  ? `Fait : ${classement.bilan.copies} envoyé(s) copié(s), ${classement.bilan.deplaces} réponse(s) déplacée(s)${
                      classement.bilan.ajoutes ? `, ${classement.bilan.ajoutes} archivée(s) ajoutée(s)` : ""
                    }${classement.bilan.dossierCree ? `. Dossier « ${classement.dossier} » créé.` : "."}${
                      classement.bilan.introuvables ? ` ${classement.bilan.introuvables} introuvable(s).` : ""
                    }`
                  : "Rien à classer."}
              </p>
            )}
            {classement.bilan && classement.bilan.erreurs.length > 0 && (
              <p className="prospection-erreur">Erreurs : {[...new Set(classement.bilan.erreurs)].slice(0, 3).join(" ; ")}</p>
            )}
            {classement.apercu && classement.lignes.length > 0 && (
              <ul style={{ margin: "6px 0 0 18px" }}>
                {classement.lignes
                  .filter((l) => l.sens === "recu")
                  .slice(0, 12)
                  .map((l, i) => (
                    <li key={i} className="prospection-meta">
                      Réponse · {l.entreprise} — {l.detail}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </div>
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
