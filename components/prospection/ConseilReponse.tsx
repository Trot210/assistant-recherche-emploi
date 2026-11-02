"use client";

import { useEffect, useState } from "react";
import { formaterDateFr } from "@/lib/prospection/dates";
import PostulerOffre from "./PostulerOffre";
import {
  LIBELLE_CATEGORIE,
  LIBELLE_RECOMMANDATION,
  passagesACompleter,
  type ConseilReponse as Conseil,
} from "@/lib/prospection/conseil-reponse";

interface Props {
  prospectionId: string;
  entrepriseId: string;
  posteVise: string;
  nomEntreprise: string;
  // Note la reprise de contact comme prochaine action de la candidature (choix de l'utilisateur).
  onNoterAction: (action: string, date: string | null) => Promise<boolean>;
}

const TON_RECOMMANDATION: Record<Conseil["recommandation"], string> = {
  repondre: "positif",
  repondre_court: "positif",
  agir_d_abord: "attente",
  attendre: "attente",
  ne_pas_repondre: "negatif",
};

// Analyse d'une réponse déjà enregistrée : ce qu'elle dit, faut-il répondre, et un
// exemple de réponse quand c'est pertinent. Rien n'est envoyé d'ici : le message
// se copie ou s'ouvre dans la messagerie de l'utilisateur, qui l'envoie lui-même.
export default function ConseilReponse({ prospectionId, entrepriseId, posteVise, nomEntreprise, onNoterAction }: Props) {
  const [conseil, setConseil] = useState<Conseil | null>(null);
  const [analyseLe, setAnalyseLe] = useState<string | null>(null);
  const [avis, setAvis] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [objet, setObjet] = useState("");
  const [corps, setCorps] = useState("");
  const [copie, setCopie] = useState(false);
  const [actionNotee, setActionNotee] = useState(false);
  // Réponse déjà envoyée depuis le site, et confirmation en cours avant un nouvel envoi.
  const [envoyee, setEnvoyee] = useState<{ destinataire: string; le: string } | null>(null);
  const [confirmation, setConfirmation] = useState({ ouverte: false, enCours: false, erreur: null as string | null });

  function afficher(c: Conseil | null) {
    setConseil(c);
    setObjet(c?.brouillon?.objet ?? "");
    setCorps(c?.brouillon?.corps ?? "");
    setCopie(false);
    setActionNotee(false);
  }

  // Le dernier conseil enregistré s'affiche sans rien recalculer (donc sans coût).
  useEffect(() => {
    let actif = true;
    fetch(`/api/prospection/${prospectionId}/conseil-reponse`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!actif || !data?.conseil) return;
        afficher(data.conseil as Conseil);
        setAnalyseLe(data.analyse_le ?? null);
        setEnvoyee(data.envoyee ?? null);
      })
      .catch(() => undefined);
    return () => {
      actif = false;
    };
  }, [prospectionId]);

  async function analyser() {
    setEnCours(true);
    setErreur(null);
    setAvis(null);
    try {
      const res = await fetch(`/api/prospection/${prospectionId}/conseil-reponse`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de l'analyse");
      afficher(data.conseil as Conseil);
      setAnalyseLe(new Date().toISOString());
      setAvis(data.avis ?? null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de l'analyse");
    } finally {
      setEnCours(false);
    }
  }

  async function copier() {
    try {
      await navigator.clipboard.writeText(corps);
      setCopie(true);
    } catch {
      setErreur("Copie impossible : sélectionne le texte et copie-le à la main.");
    }
  }

  // Un clic sur « Oui, envoyer » = un envoi, avec le texte exact affiché. Le serveur
  // refait tous les contrôles et refuse un second envoi de la même réponse.
  async function envoyer() {
    setConfirmation({ ouverte: true, enCours: true, erreur: null });
    try {
      const res = await fetch(`/api/prospection/${prospectionId}/conseil-reponse/envoyer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objet, corps }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de l'envoi");
      setEnvoyee({ destinataire: data.destinataire, le: data.envoye_le });
      setConfirmation({ ouverte: false, enCours: false, erreur: null });
    } catch (e) {
      setConfirmation({ ouverte: true, enCours: false, erreur: e instanceof Error ? e.message : "Erreur lors de l'envoi" });
    }
  }

  async function noterAction() {
    if (!conseil) return;
    const texte = conseil.relance_date ? "Reprendre contact (voir le conseil sur la réponse)" : conseil.action_suggeree;
    if (!texte) return;
    if (await onNoterAction(texte, conseil.relance_date)) setActionNotee(true);
  }

  const aCompleter = passagesACompleter(corps);
  const destinataire = conseil?.interlocuteur.email ?? "";
  const peutEnvoyer = Boolean(conseil && !conseil.ne_plus_contacter && destinataire && aCompleter.length === 0 && corps.trim() && objet.trim());

  return (
    <div className="prospection-bloc" style={{ marginTop: 4 }}>
      <div className="filter-group-label" style={{ marginBottom: 4 }}>
        Que faire de cette réponse ?
      </div>

      {!conseil && (
        <p className="prospection-meta" style={{ marginBottom: 8 }}>
          Relit la réponse dans ta boîte mail (lecture seule), te dit si répondre est utile et, si oui, propose un exemple.
          Environ 2 centimes. Rien n&apos;est envoyé ni modifié.
        </p>
      )}

      <div className="prospection-actions">
        <button className="action-btn primary" onClick={analyser} disabled={enCours}>
          {enCours ? "Analyse en cours..." : conseil ? "Analyser de nouveau" : "Analyser et proposer une réponse"}
        </button>
        {conseil && analyseLe && !enCours && (
          <span className="prospection-meta">Analysé le {formaterDateFr(analyseLe.slice(0, 10))}</span>
        )}
      </div>

      {erreur && <p className="prospection-erreur" style={{ marginTop: 8 }}>{erreur}</p>}
      {avis && <p className="prospection-meta" style={{ marginTop: 8 }}>{avis}</p>}

      {conseil && (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div>
            <div className="prospection-titre">
              {nomEntreprise}
              {conseil.interlocuteur.nom ? ` — ${conseil.interlocuteur.nom}` : ""}
              {conseil.interlocuteur.poste ? `, ${conseil.interlocuteur.poste}` : ""}
            </div>
            <div className="prospection-meta">
              {conseil.interlocuteur.email}
              {conseil.source === "extrait" && " · analysé sur l'extrait enregistré (message complet non retrouvé)"}
            </div>
          </div>

          <div>
            <div className="filter-group-label" style={{ marginBottom: 2 }}>
              Résumé
            </div>
            <span className="status-pill neutre">{LIBELLE_CATEGORIE[conseil.categorie]}</span>
            <p style={{ margin: "4px 0 0", fontSize: 15 }}>{conseil.resume}</p>
          </div>

          <div>
            <div className="filter-group-label" style={{ marginBottom: 2 }}>
              Recommandation
            </div>
            <span className={`status-pill ${TON_RECOMMANDATION[conseil.recommandation]}`}>
              <strong>{LIBELLE_RECOMMANDATION[conseil.recommandation]}</strong>
            </span>
            <p style={{ margin: "4px 0 0", fontSize: 15 }}>{conseil.justification}</p>
            {conseil.ne_plus_contacter && (
              <p className="prospection-erreur" style={{ marginTop: 4 }}>
                Cette personne demande à ne plus être contactée : n&apos;écris plus à cette adresse.
              </p>
            )}
          </div>

          {(conseil.action_suggeree || conseil.relance_date) && (
            <div>
              <div className="filter-group-label" style={{ marginBottom: 2 }}>
                Suite possible
              </div>
              {conseil.action_suggeree && <p style={{ margin: "0 0 2px", fontSize: 15 }}>{conseil.action_suggeree}</p>}
              {conseil.relance_date && (
                <p className="prospection-meta" style={{ margin: 0 }}>
                  Reprendre contact vers le {formaterDateFr(conseil.relance_date)} si rien n&apos;a bougé.
                </p>
              )}
              <div className="prospection-actions" style={{ marginTop: 6 }}>
                <button className="action-btn" onClick={noterAction} disabled={actionNotee}>
                  {actionNotee ? "Noté dans « Prochaine action »" : "Noter dans « Prochaine action »"}
                </button>
              </div>
            </div>
          )}

          {conseil.recommandation !== "attendre" &&
            !conseil.ne_plus_contacter &&
            (["redirection", "cv_non_conserve", "pas_de_besoin", "plus_tard"].includes(conseil.categorie) || conseil.recommandation === "agir_d_abord") && (
              <PostulerOffre
                prospectionId={prospectionId}
                entrepriseId={entrepriseId}
                posteVise={posteVise}
                liensReponse={conseil.liens ?? []}
              />
            )}

          {conseil.brouillon ? (
            <div>
              <div className="filter-group-label" style={{ marginBottom: 2 }}>
                Exemple de réponse
              </div>
              <p className="prospection-meta" style={{ margin: "0 0 6px" }}>
                À relire et adapter : rien ne part sans ta confirmation.
                {conseil.recommandation === "agir_d_abord" && " À envoyer seulement après avoir fait l'action indiquée ci-dessus."}
              </p>
              <label>
                Objet
                <input type="text" value={objet} onChange={(e) => setObjet(e.target.value)} />
              </label>
              <label>
                Message
                <textarea value={corps} onChange={(e) => setCorps(e.target.value)} rows={9} />
              </label>
              {aCompleter.length > 0 && (
                <p className="prospection-erreur" style={{ marginTop: 6 }}>
                  À compléter avant d&apos;envoyer : {aCompleter.map((p) => `[${p}]`).join(", ")}.
                </p>
              )}
              {conseil.avertissements.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <p className="prospection-erreur" style={{ margin: 0 }}>
                    À vérifier dans ce texte :
                  </p>
                  <ul style={{ margin: "2px 0 0 18px" }}>
                    {conseil.avertissements.map((a) => (
                      <li key={a} className="prospection-meta">
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="prospection-actions" style={{ marginTop: 8 }}>
                <button className="action-btn" onClick={copier}>
                  {copie ? "Copié" : "Copier le message"}
                </button>
                {!envoyee && (
                  <button
                    className="action-btn primary"
                    onClick={() => setConfirmation({ ouverte: true, enCours: false, erreur: null })}
                    disabled={!peutEnvoyer}
                    title={peutEnvoyer ? undefined : "Complète d'abord les passages entre crochets"}
                  >
                    Envoyer cette réponse
                  </button>
                )}
              </div>
              {envoyee && (
                <p className="prospection-info" style={{ marginTop: 8 }}>
                  Réponse envoyée à {envoyee.destinataire} le {formaterDateFr(envoyee.le.slice(0, 10))}, dans la conversation.
                </p>
              )}
              {confirmation.ouverte && !envoyee && (
                <div className="prospection-confirmation" role="alertdialog" aria-live="polite" style={{ marginTop: 10 }}>
                  <p>
                    <strong>Envoyer ce message maintenant ?</strong> Il part de ta boîte Gmail, dans la conversation, et ne peut pas être
                    rappelé.
                  </p>
                  <p className="prospection-meta" style={{ margin: 0 }}>
                    À : {conseil.interlocuteur.nom ? `${conseil.interlocuteur.nom} ` : ""}&lt;{destinataire}&gt;
                  </p>
                  <p className="prospection-meta" style={{ margin: "0 0 6px" }}>
                    Objet : {objet}
                  </p>
                  <div className="prospection-texte">{corps}</div>
                  <div className="prospection-actions" style={{ marginTop: 8 }}>
                    <button className="action-btn danger" onClick={envoyer} disabled={confirmation.enCours}>
                      {confirmation.enCours ? "Envoi..." : "Oui, envoyer"}
                    </button>
                    <button
                      className="prospection-link-btn"
                      onClick={() => setConfirmation({ ouverte: false, enCours: false, erreur: null })}
                      disabled={confirmation.enCours}
                    >
                      Annuler
                    </button>
                  </div>
                  {confirmation.erreur && <p className="prospection-erreur">{confirmation.erreur}</p>}
                </div>
              )}
            </div>
          ) : (
            <p className="prospection-meta" style={{ margin: 0 }}>
              Pas d&apos;exemple de réponse : ici, écrire ne servirait à rien.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
