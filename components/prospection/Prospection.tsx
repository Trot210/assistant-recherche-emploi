"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { aujourdhuiParis, estEnCours, relanceDue } from "@/lib/prospection/workflow";
import type { ContactEntreprise, Entreprise, Prospection as ProspectionRow } from "@/types/prospection";
import RechercheEntreprises from "./RechercheEntreprises";
import EntrepriseRow from "./EntrepriseRow";
import MessageCard, { type CvInfo } from "./MessageCard";
import CvReference from "./CvReference";

type Onglet = "entreprises" | "messages" | "relances";
type FiltreMessages = "en_cours" | "envoyes" | "tous";

interface Props {
  userId: string;
  gmailActif: boolean;
  hunterActif: boolean;
  smtpActif: boolean;
}

// Les listes ci-dessous sont chargées en entier : ce volet gère quelques
// dizaines à quelques centaines d'entreprises ciblées à la main, loin des
// 1000 lignes que PostgREST renvoie par défaut. Si l'import devait
// grossir, il faudrait paginer côté base comme le dashboard des offres.
export default function Prospection({ userId, gmailActif, hunterActif, smtpActif }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [onglet, setOnglet] = useState<Onglet>("entreprises");
  const [filtreMessages, setFiltreMessages] = useState<FiltreMessages>("en_cours");
  const [entreprises, setEntreprises] = useState<Entreprise[]>([]);
  const [contacts, setContacts] = useState<ContactEntreprise[]>([]);
  const [prospections, setProspections] = useState<ProspectionRow[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [relanceEnCours, setRelanceEnCours] = useState<string | null>(null);
  const [cv, setCv] = useState<CvInfo | null>(null);

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
    setCv(res.ok ? (data.cv ?? null) : null);
  }, []);

  useEffect(() => {
    charger();
    chargerCv();
  }, [charger, chargerCv]);

  const aujourdhui = aujourdhuiParis();
  const entrepriseParId = useMemo(() => new Map(entreprises.map((e) => [e.id, e])), [entreprises]);
  const contactParId = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  const stats = useMemo(() => {
    const initiaux = prospections.filter((p) => p.type === "initial");
    const envoyes = initiaux.filter((p) => ["envoyee", "reponse_recue", "sans_suite"].includes(p.statut));
    const reponses = initiaux.filter((p) => p.statut === "reponse_recue");
    return {
      entreprises: entreprises.length,
      aTraiter: prospections.filter((p) => estEnCours(p.statut)).length,
      envoyes: envoyes.length,
      reponses: reponses.length,
      taux: envoyes.length > 0 ? Math.round((reponses.length / envoyes.length) * 100) : null,
      relancesDues: initiaux.filter((p) => relanceDue(p, aujourdhui)).length,
    };
  }, [prospections, entreprises, aujourdhui]);

  const messagesAffiches = prospections.filter((p) => {
    if (filtreMessages === "en_cours") return estEnCours(p.statut);
    if (filtreMessages === "envoyes") return !estEnCours(p.statut);
    return true;
  });

  const relances = prospections
    .filter((p) => p.type === "initial" && p.statut === "envoyee" && p.prochaine_relance !== null)
    .sort((a, b) => (a.prochaine_relance! < b.prochaine_relance! ? -1 : 1));

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

      <CvReference cv={cv} onChange={chargerCv} />

      <div className="prospection-tabs">
        {(
          [
            ["entreprises", `Entreprises (${entreprises.length})`],
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
            {entreprises.length === 0 && (
              <p className="track-empty">
                Aucune entreprise pour l&apos;instant. Lance une recherche ci-dessus et importe celles qui
                t&apos;intéressent.
              </p>
            )}
            {entreprises.map((entreprise) => (
              <EntrepriseRow
                key={entreprise.id}
                userId={userId}
                hunterActif={hunterActif}
                entreprise={entreprise}
                contacts={contacts.filter((c) => c.entreprise_id === entreprise.id)}
                nbMessages={nbParEntreprise.get(entreprise.id) ?? 0}
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
                ["en_cours", "À traiter"],
                ["envoyes", "Envoyés et clos"],
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
          <div className="prospection-liste">
            {messagesAffiches.length === 0 && (
              <p className="track-empty">Aucun message ici. Rédige-en un depuis la fiche d&apos;une entreprise.</p>
            )}
            {messagesAffiches.map((p) => (
              <MessageCard
                key={p.id}
                cv={cv}
                smtpActif={smtpActif}
                prospection={p}
                entreprise={entrepriseParId.get(p.entreprise_id)}
                contact={p.contact_id ? contactParId.get(p.contact_id) : undefined}
                gmailActif={gmailActif}
                onChange={remplacerProspection}
                onFilModifie={charger}
              />
            ))}
          </div>
        </>
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
