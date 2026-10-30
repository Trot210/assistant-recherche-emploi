"use client";

import { useMemo, useState } from "react";
import {
  formaterProgrammation,
  instantVersLocal,
  localVersInstant,
  validerProgrammation,
} from "@/lib/prospection/planification";
import type { ContactEntreprise, Entreprise, EnvoiProgramme, Prospection } from "@/types/prospection";
import Confirmation from "./Confirmation";

interface Props {
  envois: EnvoiProgramme[];
  prospections: Prospection[];
  entreprises: Entreprise[];
  contacts: ContactEntreprise[];
  // Recharge les données après une action (envoi, annulation, programmation...).
  onChange: () => Promise<void>;
}

const LIBELLES: Record<EnvoiProgramme["statut"], string> = {
  programme: "Programmé",
  en_cours: "Envoi en cours",
  envoye: "Envoyé",
  annule: "Annulé",
  echec: "Échoué",
};

interface LignePlan {
  prospection_id: string;
  entreprise: string;
  poste: string;
  destinataire: string | null;
  prevu_at: string;
  quand: string;
}

async function appeler(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Erreur");
  return data as Record<string, unknown>;
}

// Rubrique « Envois programmés » : ce qui partira, quand, vers qui ; modifier, annuler,
// envoyer tout de suite ; étaler plusieurs messages validés sur plusieurs jours ; et
// l'historique de tout ce qui a été programmé.
export default function EnvoisProgrammes({ envois, prospections, entreprises, contacts, onChange }: Props) {
  const parProspection = useMemo(() => new Map(prospections.map((p) => [p.id, p])), [prospections]);
  const parEntreprise = useMemo(() => new Map(entreprises.map((e) => [e.id, e])), [entreprises]);
  const parContact = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  const aVenir = envois.filter((e) => e.statut === "programme" || e.statut === "en_cours").sort((a, b) => a.prevu_at.localeCompare(b.prevu_at));
  const historique = envois.filter((e) => !(e.statut === "programme" || e.statut === "en_cours")).sort((a, b) => b.prevu_at.localeCompare(a.prevu_at));

  const [edition, setEdition] = useState<{ id: string; quand: string; objet: string; corps: string } | null>(null);
  const [confirmation, setConfirmation] = useState<{ id: string; type: "annuler" | "maintenant" } | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [voirHistorique, setVoirHistorique] = useState(false);

  // Étalement
  const programmesIds = new Set(envois.filter((e) => e.statut === "programme" || e.statut === "en_cours").map((e) => e.prospection_id));
  const programmables = prospections.filter((p) => p.statut === "valide" && !programmesIds.has(p.id));
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [debut, setDebut] = useState("");
  const [maxParJour, setMaxParJour] = useState(3);
  const [plan, setPlan] = useState<LignePlan[] | null>(null);
  const [ignores, setIgnores] = useState<{ id: string; raison: string }[]>([]);

  function nom(e: EnvoiProgramme) {
    const p = parProspection.get(e.prospection_id);
    const ent = p ? parEntreprise.get(p.entreprise_id) : undefined;
    const c = p?.contact_id ? parContact.get(p.contact_id) : undefined;
    return { p, entreprise: ent?.nom ?? "Entreprise", contact: c };
  }

  async function agir(action: () => Promise<string | void>) {
    setEnCours(true);
    setErreur(null);
    setInfo(null);
    try {
      const message = await action();
      if (message) setInfo(message);
      await onChange();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
    } finally {
      setEnCours(false);
    }
  }

  async function enregistrerEdition() {
    if (!edition) return;
    const instant = localVersInstant(edition.quand);
    if (!instant) return setErreur("Date et heure invalides");
    const validation = validerProgrammation(instant, new Date());
    if (validation.erreur) return setErreur(validation.erreur);
    await agir(async () => {
      const data = await appeler(`/api/prospection/envois-programmes/${edition.id}`, {
        method: "PATCH",
        body: JSON.stringify({ prevu_at: instant.toISOString(), objet: edition.objet, corps: edition.corps }),
      });
      setEdition(null);
      return `Modifié : envoi prévu le ${data.quand as string}.${(data.avertissements as string[]).length ? ` ${(data.avertissements as string[]).join(" ")}` : ""}`;
    });
  }

  async function proposerCalendrier() {
    setErreur(null);
    setInfo(null);
    setEnCours(true);
    try {
      const data = await appeler("/api/prospection/envois-programmes/etaler", {
        method: "POST",
        body: JSON.stringify({ ids: [...selection], debut: debut || undefined, max_par_jour: maxParJour }),
      });
      setPlan(data.plan as LignePlan[]);
      setIgnores(data.ignores as { id: string; raison: string }[]);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
    } finally {
      setEnCours(false);
    }
  }

  async function confirmerCalendrier() {
    if (!plan) return;
    await agir(async () => {
      const data = await appeler("/api/prospection/envois-programmes/etaler", {
        method: "POST",
        body: JSON.stringify({ mode: "creer", confirme: true, plan: plan.map((l) => ({ prospection_id: l.prospection_id, prevu_at: l.prevu_at })) }),
      });
      const refuses = data.refuses as { raison: string }[];
      setPlan(null);
      setSelection(new Set());
      return `${(data.crees as string[]).length} envoi(s) programmé(s).${refuses.length ? ` ${refuses.length} refusé(s) : ${refuses.map((r) => r.raison).join(" ; ")}` : ""}`;
    });
  }

  function changerHoraire(index: number, valeur: string) {
    const instant = localVersInstant(valeur);
    if (!instant || !plan) return;
    setPlan(plan.map((l, i) => (i === index ? { ...l, prevu_at: instant.toISOString(), quand: formaterProgrammation(instant) } : l)));
  }

  return (
    <div>
      <p className="prospection-meta" style={{ marginBottom: 12 }}>
        Les messages ci-dessous partent tout seuls, à l&apos;heure choisie, même ordinateur éteint : le serveur les envoie depuis ta
        boîte Gmail, avec le CV de la bonne langue. Au plus un envoi toutes les 10 minutes et 6 par jour ; un passage a lieu toutes les 5
        minutes, un envoi peut donc partir avec quelques minutes de retard.
      </p>

      {erreur && <p className="prospection-erreur" style={{ marginBottom: 10 }}>{erreur}</p>}
      {info && <p className="prospection-info" style={{ marginBottom: 10 }}>{info}</p>}

      <div className="prospection-bloc">
        <h3>À venir ({aVenir.length})</h3>
        {aVenir.length === 0 && (
          <p className="track-empty" style={{ paddingBottom: 0 }}>
            Aucun envoi programmé. Programme-en depuis un message validé, ou étale plusieurs messages ci-dessous.
          </p>
        )}
        <div className="prospection-liste">
          {aVenir.map((e) => {
            const { p, entreprise, contact } = nom(e);
            const modifiable = e.statut === "programme";
            const editing = edition?.id === e.id;
            return (
              <div key={e.id} className="prospection-ligne">
                <div className="prospection-ligne-tete">
                  <div>
                    <div className="prospection-titre">
                      {entreprise} — {p?.poste_vise ?? ""}
                    </div>
                    <div className="prospection-meta">
                      À : {contact ? `${contact.nom} <${contact.email}>` : "destinataire introuvable"} · Objet : {p?.objet}
                    </div>
                    <div className="prospection-meta">
                      <b>{formaterProgrammation(new Date(e.prevu_at))}</b> · {LIBELLES[e.statut]}
                      {e.tentatives > 0 && ` · ${e.tentatives} essai(s)`}
                    </div>
                    {e.erreur && <div className="prospection-erreur">Dernier incident : {e.erreur}</div>}
                  </div>
                  {modifiable && !editing && (
                    <div className="prospection-actions">
                      <button
                        className="action-btn"
                        onClick={() =>
                          setEdition({ id: e.id, quand: instantVersLocal(new Date(e.prevu_at)), objet: p?.objet ?? "", corps: p?.corps ?? "" })
                        }
                      >
                        Modifier
                      </button>
                      <button className="action-btn primary" onClick={() => setConfirmation({ id: e.id, type: "maintenant" })}>
                        Envoyer maintenant
                      </button>
                      <button className="action-btn" onClick={() => setConfirmation({ id: e.id, type: "annuler" })}>
                        Annuler
                      </button>
                    </div>
                  )}
                </div>

                {editing && edition && (
                  <div className="prospection-detail">
                    <label>
                      Date et heure d&apos;envoi (heure de Paris)
                      <input type="datetime-local" value={edition.quand} onChange={(ev) => setEdition({ ...edition, quand: ev.target.value })} />
                    </label>
                    {localVersInstant(edition.quand) && (
                      <p className="prospection-meta">Envoi prévu le {formaterProgrammation(localVersInstant(edition.quand) as Date)}.</p>
                    )}
                    <label>
                      Objet
                      <input type="text" value={edition.objet} onChange={(ev) => setEdition({ ...edition, objet: ev.target.value })} />
                    </label>
                    <label>
                      Message
                      <textarea className="prospection-corps" value={edition.corps} onChange={(ev) => setEdition({ ...edition, corps: ev.target.value })} />
                    </label>
                    <div className="prospection-actions">
                      <button className="action-btn primary" onClick={enregistrerEdition} disabled={enCours}>
                        Enregistrer
                      </button>
                      <button className="action-btn" onClick={() => setEdition(null)} disabled={enCours}>
                        Fermer sans enregistrer
                      </button>
                    </div>
                  </div>
                )}

                {confirmation?.id === e.id && (
                  <Confirmation
                    texte={
                      confirmation.type === "maintenant"
                        ? `Le message part tout de suite à ${contact?.email ?? "ce destinataire"}, avec ton CV en pièce jointe.`
                        : "L'envoi programmé est annulé. Le message reste validé : tu pourras le reprogrammer ou l'envoyer à la main."
                    }
                    libelleEnCours={confirmation.type === "maintenant" ? "Envoi en cours..." : "Annulation..."}
                    actions={[
                      confirmation.type === "maintenant"
                        ? {
                            libelle: "Envoyer maintenant",
                            onClick: () =>
                              agir(async () => {
                                await appeler(`/api/prospection/envois-programmes/${e.id}/envoyer-maintenant`, {
                                  method: "POST",
                                  body: JSON.stringify({ confirme: true }),
                                });
                                setConfirmation(null);
                                return "Message envoyé.";
                              }),
                          }
                        : {
                            libelle: "Annuler l'envoi programmé",
                            danger: true,
                            onClick: () =>
                              agir(async () => {
                                await appeler(`/api/prospection/envois-programmes/${e.id}`, { method: "DELETE" });
                                setConfirmation(null);
                                return "Envoi annulé.";
                              }),
                          },
                    ]}
                    enCours={enCours}
                    erreur={null}
                    onAnnuler={() => setConfirmation(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="prospection-bloc">
        <h3>Étaler mes messages sur plusieurs jours</h3>
        {programmables.length === 0 ? (
          <p className="prospection-meta">Aucun message validé en attente de programmation. Valide d&apos;abord des messages dans l&apos;onglet Messages.</p>
        ) : (
          <>
            <p className="prospection-meta" style={{ marginBottom: 8 }}>
              Choisis les messages validés à répartir : ils sont proposés en jours ouvrés, entre 9 h et 17 h, à des heures variées. Tu relis le
              calendrier et tu peux ajuster chaque horaire avant de confirmer.
            </p>
            {programmables.map((p) => {
              const ent = parEntreprise.get(p.entreprise_id);
              const c = p.contact_id ? parContact.get(p.contact_id) : undefined;
              return (
                <label key={p.id} className="prospection-meta" style={{ display: "block" }}>
                  <input
                    type="checkbox"
                    checked={selection.has(p.id)}
                    onChange={(ev) =>
                      setSelection((s) => {
                        const n = new Set(s);
                        if (ev.target.checked) n.add(p.id);
                        else n.delete(p.id);
                        return n;
                      })
                    }
                  />{" "}
                  {ent?.nom ?? "Entreprise"} — {p.poste_vise} ({c?.email ?? "sans adresse"})
                </label>
              );
            })}
            <div className="prospection-form" style={{ marginTop: 10 }}>
              <div className="filter-group">
                <span className="filter-group-label">À partir du (facultatif)</span>
                <input type="date" value={debut} onChange={(ev) => setDebut(ev.target.value)} />
              </div>
              <div className="filter-group">
                <span className="filter-group-label">Au plus par jour</span>
                <select value={maxParJour} onChange={(ev) => setMaxParJour(Number(ev.target.value))}>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <button className="action-btn primary" onClick={proposerCalendrier} disabled={enCours || selection.size === 0}>
                Proposer un calendrier
              </button>
              <button className="action-btn" onClick={() => setSelection(new Set(programmables.map((p) => p.id)))} disabled={enCours}>
                Tout sélectionner
              </button>
            </div>
          </>
        )}

        {plan && (
          <div style={{ marginTop: 12 }}>
            <div className="filter-group-label" style={{ marginBottom: 6 }}>
              Calendrier proposé
            </div>
            {plan.map((l, i) => (
              <div key={l.prospection_id} className="prospection-contact">
                <span>
                  <b>{l.entreprise}</b> — {l.poste}
                  <span className="prospection-meta"> · {l.destinataire ?? "sans adresse"} · {l.quand}</span>
                </span>
                <input
                  type="datetime-local"
                  aria-label={`Horaire pour ${l.entreprise}`}
                  value={instantVersLocal(new Date(l.prevu_at))}
                  onChange={(ev) => changerHoraire(i, ev.target.value)}
                />
              </div>
            ))}
            {ignores.length > 0 && (
              <p className="prospection-erreur" style={{ marginTop: 6 }}>
                Non programmables : {ignores.map((x) => `${parProspection.get(x.id)?.poste_vise ?? x.id} (${x.raison})`).join(" ; ")}
              </p>
            )}
            <div className="prospection-actions" style={{ marginTop: 10 }}>
              <button className="action-btn primary" onClick={confirmerCalendrier} disabled={enCours || plan.length === 0}>
                {enCours ? "Programmation..." : `Confirmer et programmer ${plan.length} envoi(s)`}
              </button>
              <button className="action-btn" onClick={() => setPlan(null)} disabled={enCours}>
                Abandonner ce calendrier
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="prospection-bloc">
        <h3>Historique ({historique.length})</h3>
        <button className="action-btn" onClick={() => setVoirHistorique((v) => !v)}>
          {voirHistorique ? "Masquer l'historique" : "Voir l'historique"}
        </button>
        {voirHistorique && (
          <div className="prospection-liste" style={{ marginTop: 10 }}>
            {historique.length === 0 && <p className="prospection-meta">Rien pour l&apos;instant.</p>}
            {historique.map((e) => {
              const { p, entreprise } = nom(e);
              return (
                <div key={e.id} className="prospection-ligne">
                  <div className="prospection-titre">
                    {entreprise} — {p?.poste_vise ?? ""}
                  </div>
                  <div className="prospection-meta">
                    {LIBELLES[e.statut]} · prévu {formaterProgrammation(new Date(e.prevu_at))}
                    {e.erreur && ` · ${e.erreur}`}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
