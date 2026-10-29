"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formaterDateFr } from "@/lib/prospection/dates";
import { estEnvoye } from "@/lib/prospection/suppression";
import { aujourdhuiParis, estEnCours, relanceDue } from "@/lib/prospection/workflow";
import type { Langue } from "@/types/database.types";
import type { ContactEntreprise, Entreprise, Prospection as ProspectionRow } from "@/types/prospection";
import RechercheEntreprises from "./RechercheEntreprises";
import EntrepriseRow from "./EntrepriseRow";
import MessageCard, { type CvInfo } from "./MessageCard";
import CvReference from "./CvReference";
import MessageEnvoye from "./MessageEnvoye";
import ReponsesPanel from "./ReponsesPanel";

type Onglet = "entreprises" | "messages" | "relances";
type FiltreMessages = "en_cours" | "envoyes" | "tous";

interface Props {
  userId: string;
  gmailActif: boolean;
  hunterActif: boolean;
  smtpActif: boolean;
  imapActif: boolean;
}

// Les listes ci-dessous sont chargées en entier : ce volet gère quelques
// dizaines à quelques centaines d'entreprises ciblées à la main, loin des
// 1000 lignes que PostgREST renvoie par défaut. Si l'import devait
// grossir, il faudrait paginer côté base comme le dashboard des offres.
export default function Prospection({ userId, gmailActif, hunterActif, smtpActif, imapActif }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [onglet, setOnglet] = useState<Onglet>("entreprises");
  const [filtreMessages, setFiltreMessages] = useState<FiltreMessages>("en_cours");
  const [entreprises, setEntreprises] = useState<Entreprise[]>([]);
  const [contacts, setContacts] = useState<ContactEntreprise[]>([]);
  const [prospections, setProspections] = useState<ProspectionRow[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [voirEcartees, setVoirEcartees] = useState(false);
  const [relanceEnCours, setRelanceEnCours] = useState<string | null>(null);
  const [cvs, setCvs] = useState<Record<Langue, CvInfo | null>>({ fr: null, en: null });

  const charger = useCallback(async () => {
    const [e, c, p] = await Promise.all([
      supabase.from("entreprises").select().order("created_at", { ascending: false }),
      supabase.from("contacts").select(),
      supabase.from("prospections").select().order("created_at", { ascending: false }),
    ]);
    const echec = e.error ?? c.error ?? p.error;
    if (echec) {
      setErreur(echec.message);
    } else {
      setEntreprises(e.data ?? []);
      setContacts(c.data ?? []);
      setProspections(p.data ?? []);
    }
    setChargement(false);
  }, [supabase]);

  const chargerCv = useCallback(async () => {
    const res = await fetch("/api/profil/cv");
    const data = await res.json().catch(() => ({}));
    setCvs(res.ok && data.cv ? data.cv : { fr: null, en: null });
  }, []);

  useEffect(() => {
    charger();
    chargerCv();
  }, [charger, chargerCv]);

  const aujourdhui = aujourdhuiParis();
  // Les entreprises « écartées » (retirées de la liste) restent en base pour
  // garder l'historique de leurs messages, mais n'encombrent plus la liste ni
  // les compteurs.
  const entreprisesActives = useMemo(() => entreprises.filter((e) => e.statut !== "ecartee"), [entreprises]);
  const entreprisesEcartees = useMemo(() => entreprises.filter((e) => e.statut === "ecartee"), [entreprises]);
  const entreprisesAffichees = voirEcartees && entreprisesEcartees.length > 0 ? entreprisesEcartees : entreprisesActives;
  const entrepriseParId = useMemo(() => new Map(entreprises.map((e) => [e.id, e])), [entreprises]);
  const contactParId = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  const stats = useMemo(() => {
    const initiaux = prospections.filter((p) => p.type === "initial");
    const envoyes = initiaux.filter((p) => ["envoyee", "reponse_recue", "sans_suite"].includes(p.statut));
    const reponses = initiaux.filter((p) => p.statut === "reponse_recue");
    return {
      entreprises: entreprisesActives.length,
      aTraiter: prospections.filter((p) => estEnCours(p.statut)).length,
      envoyes: envoyes.length,
      reponses: reponses.length,
      taux: envoyes.length > 0 ? Math.round((reponses.length / envoyes.length) * 100) : null,
      relancesDues: initiaux.filter((p) => relanceDue(p, aujourdhui)).length,
    };
  }, [prospections, entreprisesActives, aujourdhui]);

  // « À traiter » : brouillons et messages prêts. « Envoyés et clos » : un fil par
  // candidature envoyée (le message initial ; ses relances s'affichent dedans).
  const messagesEnCours = prospections.filter((p) => estEnCours(p.statut));
  const fils = prospections.filter((p) => p.type === "initial" && estEnvoye(p));
  const actionsPrevues = fils
    .filter((p) => p.prochaine_action)
    .sort((a, b) => ((a.prochaine_action_date ?? "9999") < (b.prochaine_action_date ?? "9999") ? -1 : 1));

  const relances = prospections
    .filter((p) => p.type === "initial" && p.statut === "envoyee" && p.prochaine_relance !== null)
    .sort((a, b) => (a.prochaine_relance! < b.prochaine_relance! ? -1 : 1));

  function retirerMessages(ids: string[]) {
    setProspections((l) => l.filter((p) => !ids.includes(p.id)));
  }

  function entrepriseSupprimee(entrepriseId: string, ids: string[]) {
    setEntreprises((l) => l.filter((e) => e.id !== entrepriseId));
    setContacts((l) => l.filter((c) => c.entreprise_id !== entrepriseId));
    retirerMessages(ids);
  }

  function entrepriseRetiree(maj: Entreprise, ids: string[]) {
    setEntreprises((l) => l.map((e) => (e.id === maj.id ? maj : e)));
    retirerMessages(ids);
  }

  function remplacerProspection(maj: ProspectionRow) {
    setProspections((liste) => liste.map((p) => (p.id === maj.id ? maj : p)));
  }

  function ajouterProspection(nouvelle: ProspectionRow) {
    setProspections((liste) => [nouvelle, ...liste]);
    setFiltreMessages("en_cours");
    setOnglet("messages");
  }

  async function preparerRelance(initial: ProspectionRow) {
    setRelanceEnCours(initial.id);
    setErreur(null);
    try {
      const res = await fetch("/api/prospection/generer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent_id: initial.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la préparation de la relance");
      ajouterProspection(data.prospection);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de la préparation de la relance");
    } finally {
      setRelanceEnCours(null);
    }
  }

  const nbParEntreprise = useMemo(() => {
    const compte = new Map<string, number>();
    for (const p of prospections) compte.set(p.entreprise_id, (compte.get(p.entreprise_id) ?? 0) + 1);
    return compte;
  }, [prospections]);

  return (
    <div className="wrap">
      <div className="top-row">
        <div>
          <h1 className="brand-title">
            <Link href="/" className="brand-link" aria-label="Le Rayon — retour aux offres">
              Le Rayon
            </Link>
          </h1>
          <p className="eyebrow">Candidatures spontanées</p>
        </div>
        <div className="top-actions">
          <Link href="/" className="action-btn">
            ← Offres
          </Link>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <b>{stats.entreprises}</b>
          <span>entreprises ciblées</span>
        </div>
        <div className="stat">
          <b>{stats.aTraiter}</b>
          <span>messages à traiter</span>
        </div>
        <div className="stat">
          <b>{stats.envoyes}</b>
          <span>messages envoyés</span>
        </div>
        <div className="stat">
          <b>{stats.taux === null ? "—" : `${stats.taux} %`}</b>
          <span>taux de réponse ({stats.reponses})</span>
        </div>
        <div className="stat">
          <b>{stats.relancesDues}</b>
          <span>relances à faire</span>
        </div>
      </div>

      {erreur && <p className="prospection-erreur" style={{ marginBottom: 14 }}>{erreur}</p>}

      <CvReference cvs={cvs} onChange={chargerCv} />

      <div className="prospection-tabs">
        {(
          [
            ["entreprises", `Entreprises (${entreprisesActives.length})`],
            ["messages", `Messages (${stats.aTraiter} en cours)`],
            ["relances", `Relances (${stats.relancesDues} dues)`],
          ] as [Onglet, string][]
        ).map(([id, libelle]) => (
          <button key={id} className={`chip${onglet === id ? " active" : ""}`} onClick={() => setOnglet(id)}>
            {libelle}
          </button>
        ))}
      </div>

      {chargement && <p className="prospection-meta">Chargement...</p>}

      {!chargement && onglet === "entreprises" && (
        <>
          <RechercheEntreprises
            userId={userId}
            onImportees={(nouvelles) => setEntreprises((liste) => [...nouvelles, ...liste])}
          />
          <div className="prospection-liste">
            {entreprisesEcartees.length > 0 && (
              <div className="chip-row">
                <button className={`chip${!voirEcartees ? " active" : ""}`} onClick={() => setVoirEcartees(false)}>
                  Actives ({entreprisesActives.length})
                </button>
                <button className={`chip${voirEcartees ? " active" : ""}`} onClick={() => setVoirEcartees(true)}>
                  Écartées ({entreprisesEcartees.length})
                </button>
              </div>
            )}
            {entreprisesAffichees.length === 0 && (
              <p className="track-empty">
                Aucune entreprise pour l&apos;instant. Lance une recherche ci-dessus et importe celles qui
                t&apos;intéressent.
              </p>
            )}
            {entreprisesAffichees.map((entreprise) => (
              <EntrepriseRow
                key={entreprise.id}
                userId={userId}
                hunterActif={hunterActif}
                entreprise={entreprise}
                contacts={contacts.filter((c) => c.entreprise_id === entreprise.id)}
                nbMessages={nbParEntreprise.get(entreprise.id) ?? 0}
                messages={prospections.filter((p) => p.entreprise_id === entreprise.id)}
                onRetiree={entrepriseRetiree}
                onSupprimee={entrepriseSupprimee}
                onEntrepriseChange={(maj) => setEntreprises((l) => l.map((e) => (e.id === maj.id ? maj : e)))}
                onContactAjoute={(c) => setContacts((l) => [...l, c])}
                onContactSupprime={(id) => setContacts((l) => l.filter((c) => c.id !== id))}
                onMessageCree={ajouterProspection}
              />
            ))}
          </div>
        </>
      )}

      {!chargement && onglet === "messages" && (
        <>
          <div className="chip-row" style={{ marginBottom: 16 }}>
            {(
              [
                ["en_cours", `À traiter (${messagesEnCours.length})`],
                ["envoyes", `Envoyés et clos (${fils.length})`],
                ["tous", "Tous"],
              ] as [FiltreMessages, string][]
            ).map(([id, libelle]) => (
              <button
                key={id}
                className={`chip${filtreMessages === id ? " active" : ""}`}
                onClick={() => setFiltreMessages(id)}
              >
                {libelle}
              </button>
            ))}
          </div>

          {(filtreMessages === "envoyes" || filtreMessages === "tous") && imapActif && (
            <ReponsesPanel onAssociee={remplacerProspection} onFilModifie={charger} />
          )}

          <div className="prospection-liste">
            {filtreMessages !== "envoyes" && messagesEnCours.length === 0 && filtreMessages === "en_cours" && (
              <p className="track-empty">Aucun message à traiter. Rédige-en un depuis la fiche d&apos;une entreprise.</p>
            )}
            {filtreMessages !== "envoyes" &&
              messagesEnCours.map((p) => (
                <MessageCard
                  key={p.id}
                  cvs={cvs}
                  smtpActif={smtpActif}
                  prospection={p}
                  entreprise={entrepriseParId.get(p.entreprise_id)}
                  contact={p.contact_id ? contactParId.get(p.contact_id) : undefined}
                  gmailActif={gmailActif}
                  onChange={remplacerProspection}
                  onFilModifie={charger}
                  nbRelances={prospections.filter((r) => r.parent_id === p.id).length}
                  onSupprime={retirerMessages}
                />
              ))}

            {filtreMessages !== "en_cours" && fils.length === 0 && (
              <p className="track-empty">Aucune candidature envoyée pour l&apos;instant.</p>
            )}
            {filtreMessages !== "en_cours" &&
              fils.map((p) => (
                <MessageEnvoye
                  key={p.id}
                  prospection={p}
                  relances={prospections.filter((r) => r.parent_id === p.id && estEnvoye(r))}
                  nbRelances={prospections.filter((r) => r.parent_id === p.id).length}
                  entreprise={entrepriseParId.get(p.entreprise_id)}
                  contact={p.contact_id ? contactParId.get(p.contact_id) : undefined}
                  cvs={cvs}
                  onChange={remplacerProspection}
                  onFilModifie={charger}
                  onSupprime={retirerMessages}
                />
              ))}
          </div>
        </>
      )}

      {!chargement && onglet === "relances" && actionsPrevues.length > 0 && (
        <div className="prospection-bloc">
          <h3>Prochaines actions</h3>
          <div className="prospection-liste">
            {actionsPrevues.map((p) => (
              <div
                key={p.id}
                className={`prospection-ligne${p.prochaine_action_date && p.prochaine_action_date <= aujourdhui ? " due" : ""}`}
              >
                <div className="prospection-titre">
                  {entrepriseParId.get(p.entreprise_id)?.nom ?? "Entreprise"} — {p.prochaine_action}
                </div>
                <div className="prospection-meta">
                  {p.prochaine_action_date ? `Pour le ${formaterDateFr(p.prochaine_action_date)}` : "Sans date"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!chargement && onglet === "relances" && (
        <div className="prospection-liste">
          {relances.length === 0 && (
            <p className="track-empty">
              Aucune relance planifiée. Elles apparaissent ici dès qu&apos;un message est marqué comme envoyé
              (relance à J+7, puis J+14).
            </p>
          )}
          {relances.map((p) => {
            const due = relanceDue(p, aujourdhui);
            const entreprise = entrepriseParId.get(p.entreprise_id);
            const enPreparation = prospections.some((r) => r.parent_id === p.id && estEnCours(r.statut));
            return (
              <div key={p.id} className={`prospection-ligne${due ? " due" : ""}`}>
                <div className="prospection-ligne-tete">
                  <div>
                    <div className="prospection-titre">
                      {entreprise?.nom ?? "Entreprise"} — {p.poste_vise}
                    </div>
                    <div className="prospection-meta">
                      Envoyé le {p.date_envoi} · {p.nb_relances} relance(s) déjà envoyée(s) · prochaine le{" "}
                      {p.prochaine_relance}
                      {due && " — à faire maintenant"}
                    </div>
                  </div>
                  <div className="prospection-actions">
                    {enPreparation ? (
                      <button className="action-btn" onClick={() => setOnglet("messages")}>
                        Relance en préparation
                      </button>
                    ) : (
                      <button
                        className={`action-btn${due ? " primary" : ""}`}
                        onClick={() => preparerRelance(p)}
                        disabled={relanceEnCours !== null}
                      >
                        {relanceEnCours === p.id ? "Rédaction..." : "Préparer la relance"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
