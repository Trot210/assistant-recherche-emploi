"use client";

import { useCallback, useEffect, useState } from "react";

interface Reglages {
  relances_auto: boolean;
  recap_actif: boolean;
}

interface LigneClassement {
  sens: "recu" | "envoye" | "recap";
  entreprise: string;
  detail: string;
  date: string | null;
}

interface ResultatClassement {
  apercu: boolean;
  dossier: string;
  nbRecus: number;
  nbRecaps?: number;
  nbEnvoyes: number;
  lignes: LigneClassement[];
  bilan: { dossierCree: boolean; copies: number; deplaces: number; ajoutes: number; introuvables: number; erreurs: string[] } | null;
}

interface LigneCourrier {
  expediteur: string;
  sujet: string;
  nature: "accuse_reception" | "refus" | "entretien" | "autre" | "non_lie";
  resume: string;
  date: string | null;
  prospection: boolean;
}

interface ResultatCourrier {
  action: "analyser" | "ranger";
  lignes?: LigneCourrier[];
  restants?: number;
  aRanger?: { attente: number; refus: number };
  ranges?: number;
  bilan?: { erreurs: string[] } | null;
}

const LIBELLE_NATURE_COURRIER: Record<LigneCourrier["nature"], string> = {
  accuse_reception: "Accusé de réception → En attente",
  refus: "Refus → Refus",
  entretien: "Invitation à échanger (reste en boîte de réception)",
  autre: "Autre (reste en boîte de réception)",
  non_lie: "Sans rapport (reste en boîte de réception)",
};

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
  // Tri des mails de candidature : lecture (analyser), puis rangement.
  const [courrier, setCourrier] = useState<ResultatCourrier | null>(null);
  const [courrierEnCours, setCourrierEnCours] = useState(false);
  const [erreurCourrier, setErreurCourrier] = useState<string | null>(null);
  const [lignesCourrier, setLignesCourrier] = useState<LigneCourrier[]>([]);

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

  async function trierCourrier(action: "analyser" | "ranger") {
    setCourrierEnCours(true);
    setErreurCourrier(null);
    try {
      const res = await fetch("/api/prospection/courrier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      const r = data as ResultatCourrier;
      if (action === "analyser") setLignesCourrier((avant) => [...(r.lignes ?? []), ...avant]);
      setCourrier((avant) => (action === "ranger" && avant ? { ...avant, ...r, lignes: avant.lignes } : r));
    } catch (e) {
      setErreurCourrier(e instanceof Error ? e.message : "Erreur");
    } finally {
      setCourrierEnCours(false);
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
          Chaque message que le site envoie y est copié (il reste aussi dans « Envoyés »), et les réponses des entreprises ainsi que le
          récapitulatif du matin y sont déplacés hors de ta boîte de réception, toutes les dix minutes environ. Seuls les messages rattachés à une candidature sont touchés ; rien
          n&apos;est supprimé. Ici : reprendre ce qui existe déjà.
        </p>
        <div className="prospection-actions">
          <button className="action-btn" onClick={() => classer(true)} disabled={classementEnCours}>
            {classementEnCours && !classement ? "Lecture de la boîte..." : "Voir ce qui serait classé"}
          </button>
          {classement?.apercu && (classement.nbRecus > 0 || (classement.nbRecaps ?? 0) > 0 || classement.nbEnvoyes > 0) && (
            <button className="action-btn primary" onClick={() => classer(false)} disabled={classementEnCours}>
              {classementEnCours ? "Classement..." : `Classer maintenant (${classement.nbEnvoyes} envoyé(s), ${classement.nbRecus} réponse(s), ${classement.nbRecaps ?? 0} récapitulatif(s))`}
            </button>
          )}
        </div>
        {erreurClassement && <p className="prospection-erreur" style={{ marginTop: 8 }}>{erreurClassement}</p>}
        {classement && (
          <div style={{ marginTop: 10 }}>
            {classement.apercu ? (
              <p className="prospection-meta">
                À classer : {classement.nbEnvoyes} message(s) envoyé(s) à copier, {classement.nbRecus} réponse(s) et {classement.nbRecaps ?? 0}{" "}
                récapitulatif(s) du matin à déplacer hors de la boîte de réception.
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
      <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
        <h3 style={{ marginBottom: 6 }}>Mails de candidature : « En attente réponse » et « Refus »</h3>
        <p className="prospection-meta" style={{ marginBottom: 8 }}>
          Le site lit les mails de candidature reçus à partir du 3 novembre 2026 (les plus anciens ne sont pas touchés), jusqu&apos;à 25 par clic, environ 0,5 centime chacun. Un accusé de
          réception va dans « En attente réponse », un refus va dans « Refus » ; une invitation à échanger reste en boîte de réception, pour que
          tu la voies. Tu vois d&apos;abord ce qui a été lu, puis tu choisis de ranger. Rien n&apos;est supprimé.
        </p>
        <div className="prospection-actions">
          <button className="action-btn" onClick={() => trierCourrier("analyser")} disabled={courrierEnCours}>
            {courrierEnCours ? "Lecture en cours..." : courrier ? "Lire la suite" : "Lire mes mails de candidature"}
          </button>
          {courrier?.aRanger && courrier.aRanger.attente + courrier.aRanger.refus > 0 && (
            <button className="action-btn primary" onClick={() => trierCourrier("ranger")} disabled={courrierEnCours}>
              Ranger ({courrier.aRanger.attente} en attente, {courrier.aRanger.refus} refus)
            </button>
          )}
        </div>
        {erreurCourrier && <p className="prospection-erreur" style={{ marginTop: 8 }}>{erreurCourrier}</p>}
        {courrier?.action === "ranger" && (
          <p className="prospection-info" style={{ marginTop: 8 }}>
            {courrier.ranges ?? 0} mail(s) rangé(s).
            {courrier.bilan && courrier.bilan.erreurs.length > 0 ? ` Erreurs : ${[...new Set(courrier.bilan.erreurs)].slice(0, 2).join(" ; ")}` : ""}
          </p>
        )}
        {courrier && typeof courrier.restants === "number" && courrier.restants > 0 && (
          <p className="prospection-meta" style={{ marginTop: 8 }}>Il en reste à lire : clique sur « Lire la suite ».</p>
        )}
        {lignesCourrier.length > 0 && (
          <ul style={{ margin: "8px 0 0 18px" }}>
            {lignesCourrier.slice(0, 40).map((l, i) => (
              <li key={i} className="prospection-meta">
                <b>{l.expediteur}</b> — {l.sujet.slice(0, 60)} · {LIBELLE_NATURE_COURRIER[l.nature]}
                {l.prospection ? " · réponse à ta prospection" : ""}
              </li>
            ))}
          </ul>
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
