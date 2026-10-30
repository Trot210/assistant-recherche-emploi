"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formaterDateFr } from "@/lib/prospection/dates";
import { offrePertinente } from "@/lib/prospection/offres";
import { aujourdhuiParis, estEnCours, relanceDue } from "@/lib/prospection/workflow";
import { calculerPriorite, resumerPriorite } from "@/lib/prospection/priorite";
import type { ContactEntreprise, Entreprise, Prospection } from "@/types/prospection";
import Automatisation from "@/components/Automatisation";
import CoutClaude from "@/components/CoutClaude";
import ReponsesPanel from "@/components/prospection/ReponsesPanel";

const JOURS_NOUVELLES_OFFRES = 3;
const JOURS_ACTIONS_A_VENIR = 7;
const MAX_LIGNES = 5;

function ajouterJours(date: string, jours: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

// Ce qu'il faut faire aujourd'hui, au même endroit : messages à valider, relances
// dues, actions prévues, réponses à lire, nouvelles offres. Tout est calculé sur
// les données existantes, sans appel à Claude.
export default function Aujourdhui({ imapActif }: { imapActif: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [entreprises, setEntreprises] = useState<Entreprise[]>([]);
  const [prospections, setProspections] = useState<Prospection[]>([]);
  const [contacts, setContacts] = useState<ContactEntreprise[]>([]);
  const [nouvellesOffres, setNouvellesOffres] = useState<number | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const depuis = new Date(Date.now() - JOURS_NOUVELLES_OFFRES * 86_400_000).toISOString();
    const [e, p, o, c] = await Promise.all([
      supabase.from("entreprises").select(),
      supabase.from("prospections").select().order("created_at", { ascending: false }),
      supabase.from("offres").select("titre").gte("created_at", depuis).limit(1000),
      supabase.from("contacts").select(),
    ]);
    const echec = e.error ?? p.error;
    if (echec) setErreur(echec.message);
    else {
      setEntreprises(e.data ?? []);
      setProspections(p.data ?? []);
      setContacts(c.data ?? []);
    }
    setNouvellesOffres(o.error ? null : (o.data ?? []).filter((x) => offrePertinente(x.titre)).length);
    setChargement(false);
  }, [supabase]);

  useEffect(() => {
    charger();
  }, [charger]);

  const aujourdhui = aujourdhuiParis();
  const nomEntreprise = useMemo(() => new Map(entreprises.map((e) => [e.id, e.nom])), [entreprises]);

  const aValider = prospections.filter((p) => estEnCours(p.statut));
  const relancesDues = prospections.filter((p) => p.type === "initial" && relanceDue(p, aujourdhui));
  const limiteActions = ajouterJours(aujourdhui, JOURS_ACTIONS_A_VENIR);
  const actions = prospections
    .filter((p) => p.type === "initial" && p.prochaine_action && (p.prochaine_action_date ?? "") <= limiteActions)
    .sort((a, b) => ((a.prochaine_action_date ?? "") < (b.prochaine_action_date ?? "") ? -1 : 1));
  const avecMessage = new Set(prospections.map((p) => p.entreprise_id));
  const sansMessage = entreprises.filter((e) => e.statut !== "ecartee" && !avecMessage.has(e.id));

  // Les entreprises à écrire en premier : les mieux notées, pas encore contactées.
  const prioritaires = entreprises
    .map((e) => ({
      entreprise: e,
      priorite: calculerPriorite({
        entreprise: e,
        contacts: contacts.filter((c) => c.entreprise_id === e.id),
        nbMessages: prospections.filter((p) => p.entreprise_id === e.id).length,
      }),
    }))
    .filter((x) => !x.priorite.exclue && x.priorite.score >= 40)
    .sort((a, b) => b.priorite.score - a.priorite.score)
    .slice(0, 3);

  const rien =
    !chargement && aValider.length === 0 && relancesDues.length === 0 && actions.length === 0 && !(nouvellesOffres && nouvellesOffres > 0);

  const nom = (p: Prospection) => nomEntreprise.get(p.entreprise_id) ?? "Entreprise";

  return (
    <div className="wrap">
      <div className="top-row">
        <div>
          <h1 className="brand-title">
            <Link href="/" className="brand-link" aria-label="Le Rayon — retour aux offres">
              Le Rayon
            </Link>
          </h1>
          <p className="eyebrow">Aujourd&apos;hui · {formaterDateFr(aujourdhui)}</p>
        </div>
        <div className="top-actions">
          <Link href="/prospection" className="action-btn">
            Candidatures spontanées
          </Link>
          <Link href="/" className="action-btn">
            Offres
          </Link>
        </div>
      </div>

      <CoutClaude detail />

      {erreur && <p className="prospection-erreur" style={{ marginBottom: 14 }}>{erreur}</p>}
      {chargement && <p className="prospection-meta">Chargement...</p>}
      {rien && <p className="track-empty">Rien d&apos;urgent aujourd&apos;hui.</p>}

      {aValider.length > 0 && (
        <div className="prospection-bloc">
          <h3>Messages à valider ({aValider.length})</h3>
          <div className="prospection-liste">
            {aValider.slice(0, MAX_LIGNES).map((p) => (
              <div key={p.id} className="prospection-ligne">
                <div className="prospection-titre">
                  {nom(p)} — {p.poste_vise}
                </div>
                <div className="prospection-meta">{p.type === "relance" ? "Relance" : "Premier message"} · {p.statut === "a_valider" ? "à relire" : "prêt à envoyer"}</div>
              </div>
            ))}
          </div>
          <Link href="/prospection?onglet=messages" className="action-btn primary" style={{ marginTop: 10, display: "inline-block" }}>
            Ouvrir les messages
          </Link>
        </div>
      )}

      {relancesDues.length > 0 && (
        <div className="prospection-bloc">
          <h3>Relances à faire ({relancesDues.length})</h3>
          <div className="prospection-liste">
            {relancesDues.slice(0, MAX_LIGNES).map((p) => (
              <div key={p.id} className="prospection-ligne due">
                <div className="prospection-titre">
                  {nom(p)} — {p.poste_vise}
                </div>
                <div className="prospection-meta">
                  Envoyé le {p.date_envoi ? formaterDateFr(p.date_envoi) : "?"} · prévue le{" "}
                  {p.prochaine_relance ? formaterDateFr(p.prochaine_relance) : "?"}
                </div>
              </div>
            ))}
          </div>
          <Link href="/prospection?onglet=relances" className="action-btn primary" style={{ marginTop: 10, display: "inline-block" }}>
            Préparer les relances
          </Link>
        </div>
      )}

      {actions.length > 0 && (
        <div className="prospection-bloc">
          <h3>Prochaines actions</h3>
          <div className="prospection-liste">
            {actions.slice(0, MAX_LIGNES).map((p) => (
              <div
                key={p.id}
                className={`prospection-ligne${p.prochaine_action_date && p.prochaine_action_date <= aujourdhui ? " due" : ""}`}
              >
                <div className="prospection-titre">
                  {nom(p)} — {p.prochaine_action}
                </div>
                <div className="prospection-meta">
                  {p.prochaine_action_date ? `Pour le ${formaterDateFr(p.prochaine_action_date)}` : "Sans date"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {imapActif ? (
        <ReponsesPanel onAssociee={charger} onFilModifie={charger} />
      ) : (
        <p className="prospection-meta">La lecture des réponses n&apos;est pas configurée (SMTP_USER et SMTP_PASSWORD).</p>
      )}

      {nouvellesOffres !== null && nouvellesOffres > 0 && (
        <div className="prospection-bloc" style={{ marginTop: 18 }}>
          <h3>Nouvelles offres</h3>
          <p className="prospection-meta">
            {nouvellesOffres} offre(s) correspondant à tes postes ciblés sont arrivées ces {JOURS_NOUVELLES_OFFRES} derniers jours.
          </p>
          <Link href="/" className="action-btn" style={{ marginTop: 10, display: "inline-block" }}>
            Voir les offres
          </Link>
        </div>
      )}

      {prioritaires.length > 0 && (
        <div className="prospection-bloc" style={{ marginTop: 18 }}>
          <h3>À écrire en premier</h3>
          <div className="prospection-liste">
            {prioritaires.map(({ entreprise, priorite }) => (
              <div key={entreprise.id} className="prospection-ligne">
                <div className="prospection-titre">
                  {entreprise.nom} — priorité {priorite.score}/100
                </div>
                <div className="prospection-meta">{resumerPriorite(priorite)}</div>
              </div>
            ))}
          </div>
          <Link href="/prospection?onglet=entreprises" className="action-btn" style={{ marginTop: 10, display: "inline-block" }}>
            Ouvrir les entreprises
          </Link>
        </div>
      )}

      {sansMessage.length > 0 && (
        <div className="prospection-bloc" style={{ marginTop: 18 }}>
          <h3>Entreprises sans message ({sansMessage.length})</h3>
          <p className="prospection-meta">
            {sansMessage
              .slice(0, 6)
              .map((e) => e.nom)
              .join(", ")}
            {sansMessage.length > 6 ? "..." : ""}
          </p>
          <Link href="/prospection?onglet=entreprises" className="action-btn" style={{ marginTop: 10, display: "inline-block" }}>
            Préparer un message
          </Link>
        </div>
      )}
      <Automatisation />
    </div>
  );
}
