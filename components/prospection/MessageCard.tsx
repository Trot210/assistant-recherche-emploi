"use client";

import { useState } from "react";
import { libelleLangue } from "@/lib/prospection/langue";
import { formaterProgrammation, localVersInstant, validerProgrammation } from "@/lib/prospection/planification";
import { estEnvoye, peutSupprimerMessage, texteSuppressionMessage } from "@/lib/prospection/suppression";
import AdresseDestinataire from "./AdresseDestinataire";
import Confirmation from "./Confirmation";
import type { Langue, ProspectionStatut } from "@/types/database.types";
import type { ContactEntreprise, Entreprise, EnvoiProgramme, Prospection } from "@/types/prospection";

export interface CvInfo {
  nomFichier: string;
  taille: number | null;
  url: string | null;
}

interface Props {
  cvs: Record<Langue, CvInfo | null>;
  smtpActif: boolean;
  prospection: Prospection;
  entreprise: Entreprise | undefined;
  contact: ContactEntreprise | undefined;
  gmailActif: boolean;
  onChange: (prospection: Prospection) => void;
  // Une réponse ou une clôture peut modifier d'autres lignes du même fil.
  onFilModifie: () => void;
  // Nombre de relances rattachées à ce message (supprimées avec lui).
  nbRelances: number;
  onSupprime: (ids: string[]) => void;
  // Envoi programmé actif de ce message, s'il y en a un.
  programmation?: EnvoiProgramme;
  onVoirProgrammes?: () => void;
}

export const LIBELLES_STATUT_MESSAGE: Record<ProspectionStatut, string> = {
  a_valider: "À valider",
  valide: "Validé",
  brouillon_gmail: "Brouillon Gmail créé",
  envoyee: "Envoyé",
  reponse_recue: "Réponse reçue",
  sans_suite: "Sans suite",
};

function formaterDate(dateIso: string | null): string {
  if (!dateIso) return "";
  const [annee, mois, jour] = dateIso.split("-");
  return `${jour}/${mois}/${annee}`;
}

export default function MessageCard({
  cvs,
  smtpActif,
  prospection,
  entreprise,
  contact,
  gmailActif,
  onChange,
  onFilModifie,
  nbRelances,
  onSupprime,
  programmation,
  onVoirProgrammes,
}: Props) {
  const [ouvert, setOuvert] = useState(prospection.statut === "a_valider");
  const [objet, setObjet] = useState(prospection.objet);
  const [corps, setCorps] = useState(prospection.corps);
  const [joindreCv, setJoindreCv] = useState(true);
  const [confirme, setConfirme] = useState(false);
  const [suppression, setSuppression] = useState<{ ouverte: boolean; enCours: boolean; erreur: string | null }>({
    ouverte: false,
    enCours: false,
    erreur: null,
  });
  const [action, setAction] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [programmerOuvert, setProgrammerOuvert] = useState(false);
  const [quand, setQuand] = useState("");

  // Le CV joint suit la langue du message.
  const cv = cvs[prospection.langue];
  const modifiable = ["a_valider", "valide", "brouillon_gmail"].includes(prospection.statut);
  const modifie = objet !== prospection.objet || corps !== prospection.corps;

  async function appeler(nom: string, url: string, init: RequestInit): Promise<Record<string, unknown> | null> {
    setAction(nom);
    setErreur(null);
    setInfo(null);
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      return data;
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
      return null;
    } finally {
      setAction(null);
    }
  }

  async function enregistrer() {
    const data = await appeler("enregistrer", `/api/prospection/${prospection.id}`, {
      method: "PATCH",
      body: JSON.stringify({ objet, corps }),
    });
    if (data) onChange(data.prospection as Prospection);
  }

  async function faireAvancer(nom: "valider" | "marquer_envoyee" | "reponse_recue" | "sans_suite") {
    const data = await appeler(nom, `/api/prospection/${prospection.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: nom }),
    });
    if (!data) return;
    onChange(data.prospection as Prospection);
    if (nom !== "valider") onFilModifie();
  }

  async function creerBrouillon() {
    const data = await appeler("brouillon", `/api/prospection/${prospection.id}/brouillon-gmail`, {
      method: "POST",
      body: JSON.stringify({ joindre_cv: joindreCv }),
    });
    if (!data) return;
    onChange(data.prospection as Prospection);
    const avertissementsCv = (data.avertissements_cv as string[]) ?? [];
    setInfo(
      avertissementsCv.length > 0
        ? `Brouillon créé. Vérifie dans le CV joint : ${avertissementsCv.join(" / ")}`
        : "Brouillon créé dans Gmail — relis-le et envoie-le depuis Gmail.",
    );
    if (typeof data.lien_brouillon === "string") window.open(data.lien_brouillon, "_blank", "noopener");
  }

  // Date saisie (heure de Paris) → instant, avec les avertissements éventuels.
  const instantProgramme = localVersInstant(quand);
  const validationProgramme = instantProgramme ? validerProgrammation(instantProgramme, new Date()) : null;

  async function programmer() {
    if (!instantProgramme) return;
    const data = await appeler("programmation", `/api/prospection/${prospection.id}/programmer`, {
      method: "POST",
      body: JSON.stringify({ prevu_at: instantProgramme.toISOString(), confirme: true }),
    });
    if (!data) return;
    onFilModifie();
    setConfirme(false);
    setProgrammerOuvert(false);
    setInfo(`Envoi programmé : ${data.quand as string}. Tu peux le modifier ou l'annuler dans l'onglet « Programmés ».`);
  }

  async function envoyer() {
    const data = await appeler("envoi", `/api/prospection/${prospection.id}/envoyer`, {
      method: "POST",
      body: JSON.stringify({ confirme: true, joindre_cv: joindreCv }),
    });
    if (!data) return;
    onChange(data.prospection as Prospection);
    onFilModifie();
    setConfirme(false);
    setInfo(
      `Message envoyé à ${contact?.email}${data.piece_jointe ? ` avec ${data.piece_jointe} en pièce jointe` : " (sans pièce jointe)"}.`,
    );
  }

  async function supprimer() {
    setSuppression({ ouverte: true, enCours: true, erreur: null });
    try {
      const res = await fetch(`/api/prospection/${prospection.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la suppression");
      onSupprime(data.supprimes as string[]);
    } catch (e) {
      setSuppression({ ouverte: true, enCours: false, erreur: e instanceof Error ? e.message : "Erreur lors de la suppression" });
    }
  }

  async function copier() {
    try {
      await navigator.clipboard.writeText(`${prospection.objet}\n\n${prospection.corps}`);
      setInfo("Message copié.");
    } catch {
      setErreur("Copie impossible depuis ce navigateur");
    }
  }

  const mailto = contact?.email
    ? `mailto:${contact.email}?subject=${encodeURIComponent(prospection.objet)}&body=${encodeURIComponent(prospection.corps)}`
    : null;

  const autorisationSuppression = peutSupprimerMessage(prospection);
  const classeLigne =
    prospection.statut === "reponse_recue" ? "ok" : prospection.statut === "a_valider" ? "due" : "";

  return (
    <div className={`prospection-ligne ${classeLigne}`}>
      <div className="prospection-ligne-tete">
        <div>
          <div className="prospection-titre">
            {entreprise?.nom ?? "Entreprise"} — {prospection.poste_vise}
            {prospection.type === "relance" && " (relance)"}
          </div>
          <div className="prospection-meta">
            {contact ? `${contact.nom}${contact.email ? ` <${contact.email}>` : " (pas d'e-mail)"}` : "Sans contact précis"}
            {prospection.date_envoi && ` · envoyé le ${formaterDate(prospection.date_envoi)}`}
            {prospection.prochaine_relance && prospection.statut === "envoyee" &&
              ` · relance prévue le ${formaterDate(prospection.prochaine_relance)}`}
          </div>
        </div>
        <div className="prospection-actions">
          <span className="status-pill">{libelleLangue(prospection.langue)}</span>
          <span className="status-pill">{LIBELLES_STATUT_MESSAGE[prospection.statut]}</span>
          <button className="action-btn" onClick={() => setOuvert((v) => !v)}>
            {ouvert ? "Réduire" : "Voir"}
          </button>
          <button
            className="prospection-croix"
            aria-label="Supprimer ce message"
            title={autorisationSuppression.ok ? "Supprimer ce message" : autorisationSuppression.raison}
            disabled={!autorisationSuppression.ok}
            onClick={() => setSuppression({ ouverte: true, enCours: false, erreur: null })}
          >
            ✕
          </button>
        </div>
      </div>

      {suppression.ouverte && (
        <Confirmation
          texte={texteSuppressionMessage({
            nomEntreprise: entreprise?.nom ?? "cette entreprise",
            envoye: estEnvoye(prospection),
            dateEnvoi: prospection.date_envoi ? formaterDate(prospection.date_envoi) : null,
            nbRelances,
          })}
          actions={[{ libelle: "Supprimer définitivement", onClick: supprimer, danger: true }]}
          enCours={suppression.enCours}
          erreur={suppression.erreur}
          onAnnuler={() => setSuppression({ ouverte: false, enCours: false, erreur: null })}
        />
      )}

      {ouvert && (
        <div className="prospection-detail">
          {prospection.avertissements.length > 0 && (
            <div className="prospection-alerte">
              À vérifier avant de valider — le contrôle qualité n&apos;a pas pu rattacher ces points à ton profil :
              <ul>
                {prospection.avertissements.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          <label>
            Objet
            <input type="text" value={objet} onChange={(e) => setObjet(e.target.value)} disabled={!modifiable} />
          </label>
          <label>
            Message
            <textarea
              className="prospection-corps"
              value={corps}
              onChange={(e) => setCorps(e.target.value)}
              disabled={!modifiable}
            />
          </label>

          {modifiable && modifie && (
            <p className="prospection-meta">
              Tu as modifié le texte : enregistre, puis valide-le à nouveau
              {prospection.statut !== "a_valider" && " (le brouillon Gmail déjà créé ne sera plus à jour)"}.
            </p>
          )}

          {modifiable && !modifie && !contact?.email && (
            <AdresseDestinataire prospection={prospection} contact={contact} onEnregistree={onFilModifie} />
          )}

          {smtpActif && (prospection.statut === "valide" || prospection.statut === "brouillon_gmail") && !modifie && (
            <div className="prospection-bloc" style={{ marginBottom: 0, background: "var(--paper)" }}>
              <h3>Vérification avant envoi</h3>
              <ul style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7 }}>
                <li>
                  <b>À :</b>{" "}
                  {contact?.email ? `${contact.nom} <${contact.email}>` : "aucun destinataire avec une adresse e-mail"}
                </li>
                <li>
                  <b>Objet :</b> {prospection.objet}
                </li>
                <li>
                  <b>Langue :</b> {libelleLangue(prospection.langue)}
                </li>
                <li>
                  <b>Pièce jointe :</b>{" "}
                  {!joindreCv ? (
                    "aucune"
                  ) : cv ? (
                    <>
                      {cv.nomFichier}
                      {cv.taille ? ` (${Math.round(cv.taille / 1024)} Ko)` : ""}{" "}
                      {cv.url && (
                        <a href={cv.url} target="_blank" rel="noopener noreferrer">
                          ouvrir pour vérifier
                        </a>
                      )}
                    </>
                  ) : (
                    <span className="prospection-erreur">
                      aucun CV {prospection.langue === "en" ? "anglais" : "français"} enregistré — ajoute-le en haut de la page
                    </span>
                  )}
                </li>
              </ul>
              <label style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <input type="checkbox" checked={joindreCv} onChange={(e) => setJoindreCv(e.target.checked)} />
                Joindre mon CV
              </label>
              <label style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
                <input type="checkbox" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} />
                J&apos;ai vérifié le destinataire, le texte et la pièce jointe
              </label>
              {programmation && (
                <p className="prospection-info" style={{ marginBottom: 10 }}>
                  Envoi programmé : <b>{formaterProgrammation(new Date(programmation.prevu_at))}</b>.{" "}
                  {onVoirProgrammes && (
                    <button className="prospection-link-btn" onClick={onVoirProgrammes}>
                      Gérer dans « Programmés »
                    </button>
                  )}
                </p>
              )}
              <div className="prospection-actions">
                <button
                  className="action-btn primary"
                  onClick={envoyer}
                  disabled={action !== null || !confirme || !contact?.email || (joindreCv && !cv)}
                >
                  {action === "envoi" ? "Envoi en cours..." : "Envoyer maintenant"}
                </button>
                {prospection.statut === "valide" && !programmation && (
                  <button
                    className="action-btn"
                    onClick={() => setProgrammerOuvert((v) => !v)}
                    disabled={action !== null || !confirme || !contact?.email || !joindreCv || !cv}
                    title={!joindreCv ? "Un envoi programmé joint toujours ton CV" : undefined}
                  >
                    Programmer l&apos;envoi
                  </button>
                )}
              </div>
              {!contact?.email && (
                <p className="prospection-erreur" style={{ marginTop: 10 }}>
                  Envoi et programmation impossibles tant que le destinataire n&apos;a pas d&apos;adresse e-mail : renseigne-la dans le
                  bloc « Adresse e-mail du destinataire » ci-dessus.
                </p>
              )}
              {programmerOuvert && (
                <div style={{ marginTop: 12 }}>
                  <label>
                    Date et heure d&apos;envoi (heure de Paris)
                    <input type="datetime-local" value={quand} onChange={(e) => setQuand(e.target.value)} />
                  </label>
                  {instantProgramme && !validationProgramme?.erreur && (
                    <p className="prospection-info" style={{ marginTop: 8 }}>
                      Envoi prévu le <b>{formaterProgrammation(instantProgramme)}</b>, à {contact?.email}, avec {cv?.nomFichier ?? "ton CV"}.
                    </p>
                  )}
                  {validationProgramme?.erreur && <p className="prospection-erreur" style={{ marginTop: 8 }}>{validationProgramme.erreur}</p>}
                  {validationProgramme?.avertissements.map((a) => (
                    <p key={a} className="prospection-meta" style={{ marginTop: 4 }}>
                      {a}
                    </p>
                  ))}
                  <button
                    className="action-btn primary"
                    style={{ marginTop: 10 }}
                    onClick={programmer}
                    disabled={action !== null || !instantProgramme || Boolean(validationProgramme?.erreur)}
                  >
                    {action === "programmation" ? "Programmation..." : "Confirmer la programmation"}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="prospection-actions">
            {modifiable && modifie && (
              <button className="action-btn primary" onClick={enregistrer} disabled={action !== null}>
                Enregistrer les modifications
              </button>
            )}

            {prospection.statut === "a_valider" && !modifie && (
              <button className="action-btn primary" onClick={() => faireAvancer("valider")} disabled={action !== null}>
                Valider ce message
              </button>
            )}

            {prospection.statut === "valide" && !modifie && (
              <>
                {gmailActif && (
                  <>
                    <button
                      className="action-btn primary"
                      onClick={creerBrouillon}
                      disabled={action !== null || !contact?.email}
                      title={contact?.email ? undefined : "Ajoute un contact avec une adresse e-mail"}
                    >
                      {action === "brouillon" ? "Création du brouillon..." : "Créer le brouillon Gmail"}
                    </button>

                  </>
                )}
                <button className="action-btn" onClick={copier}>
                  Copier le message
                </button>
                {mailto && (
                  <a className="action-btn" href={mailto}>
                    Ouvrir dans ma messagerie
                  </a>
                )}
              </>
            )}

            {prospection.statut === "brouillon_gmail" && !modifie && prospection.gmail_message_id && (
              <a
                className="action-btn"
                href={`https://mail.google.com/mail/u/0/#drafts?compose=${prospection.gmail_message_id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ouvrir le brouillon
              </a>
            )}

            {(prospection.statut === "valide" || prospection.statut === "brouillon_gmail") && !modifie && (
              <button className="action-btn" onClick={() => faireAvancer("marquer_envoyee")} disabled={action !== null}>
                J&apos;ai envoyé ce message
              </button>
            )}

            {prospection.statut === "envoyee" && (
              <>
                <button className="action-btn primary" onClick={() => faireAvancer("reponse_recue")} disabled={action !== null}>
                  J&apos;ai reçu une réponse
                </button>
                <button className="action-btn" onClick={() => faireAvancer("sans_suite")} disabled={action !== null}>
                  Clore sans suite
                </button>
              </>
            )}
          </div>

          {!gmailActif && prospection.statut === "valide" && (
            <p className="prospection-meta">
              {smtpActif
                ? "Tu peux aussi copier le message ou l'ouvrir dans ta messagerie."
                : "L'envoi n'est pas configuré : copie le message ou ouvre-le dans ta messagerie (voir .env.example pour activer l'envoi depuis la plateforme)."}
            </p>
          )}
          {info && <p className="prospection-info">{info}</p>}
          {erreur && <p className="prospection-erreur">{erreur}</p>}
        </div>
      )}
    </div>
  );
}
