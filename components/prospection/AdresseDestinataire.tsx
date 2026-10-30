"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { libelleVerification } from "@/lib/hunter/verification";
import { decouperNomComplet } from "@/lib/prospection/adresses";
import type { EmailVerification } from "@/types/database.types";
import type { ContactEntreprise, Prospection } from "@/types/prospection";

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Candidat {
  email: string;
  patron: string;
  verification: EmailVerification | null;
  deja_connu: boolean;
}

interface Props {
  prospection: Prospection;
  // Contact du message ; absent quand le message a été préparé « sans contact précis ».
  contact: ContactEntreprise | undefined;
  // Recharge les données une fois l'adresse enregistrée.
  onEnregistree: () => void;
}

// Un message ne peut partir que vers une adresse e-mail. Quand le destinataire n'en a
// pas (contact saisi sans adresse, ou message sans contact), ce bloc la complète sur
// place : saisie à la main (avec sa source, pour pouvoir répondre à une demande RGPD)
// ou déduction du format des adresses de l'entreprise, vérifiée par Hunter.
export default function AdresseDestinataire({ prospection, contact, onEnregistree }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [nom, setNom] = useState(contact?.nom ?? "");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [candidats, setCandidats] = useState<Candidat[] | null>(null);
  const [infoVerif, setInfoVerif] = useState<string | null>(null);
  const [domaine, setDomaine] = useState<string | null>(null);

  const identite = decouperNomComplet(contact?.nom ?? nom);

  async function enregistrer(
    adresse: string,
    details: { origine: "manuel" | "devine"; source_email: string; verification: EmailVerification | null },
  ) {
    setErreur(null);
    const nomContact = (contact?.nom ?? nom).trim();
    if (!nomContact) return setErreur("Indique le nom du destinataire");

    setEnCours(true);
    try {
      const champs = {
        email: adresse,
        source_email: details.source_email,
        origine: details.origine,
        email_verification: details.verification,
        email_verifie_at: details.verification ? new Date().toISOString() : null,
        email_statut: "ok" as const,
      };
      if (contact) {
        const { error } = await supabase.from("contacts").update(champs).eq("id", contact.id).eq("user_id", prospection.user_id);
        if (error) throw new Error(error.message);
      } else {
        const { data: cree, error } = await supabase
          .from("contacts")
          .insert({ user_id: prospection.user_id, entreprise_id: prospection.entreprise_id, nom: nomContact, ...champs })
          .select()
          .single();
        if (error) throw new Error(error.message);
        const { error: liaison } = await supabase
          .from("prospections")
          .update({ contact_id: cree.id })
          .eq("id", prospection.id)
          .eq("user_id", prospection.user_id);
        if (liaison) throw new Error(liaison.message);
      }
      onEnregistree();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setEnCours(false);
    }
  }

  function enregistrerSaisie() {
    const adresse = email.trim();
    if (!EMAIL_VALIDE.test(adresse)) return setErreur("Adresse e-mail invalide");
    if (!source.trim()) {
      return setErreur("Indique d'où vient l'adresse (site de l'entreprise, annuaire public, échange avec la personne...) : c'est la trace qui te permet de répondre à une demande RGPD");
    }
    enregistrer(adresse, { origine: "manuel", source_email: source.trim(), verification: null });
  }

  async function deviner() {
    if (!identite) return setErreur("Il faut un prénom et un nom pour déduire l'adresse");
    setErreur(null);
    setCandidats(null);
    setInfoVerif(null);
    setEnCours(true);
    try {
      const res = await fetch(`/api/prospection/entreprises/${prospection.entreprise_id}/deviner-adresse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prenom: identite.prenom, nom: identite.nom }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la recherche");
      setCandidats(data.candidats as Candidat[]);
      setDomaine(data.domaine as string);
      setInfoVerif((data.verification_indisponible as string | null) ?? null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de la recherche");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="prospection-bloc" style={{ marginBottom: 0, background: "var(--paper)" }}>
      <h3>Adresse e-mail du destinataire</h3>
      <p className="prospection-meta" style={{ marginBottom: 10 }}>
        {contact
          ? `${contact.nom} n'a pas d'adresse e-mail : le message ne peut pas partir tant qu'elle n'est pas renseignée.`
          : "Ce message n'a pas de destinataire : renseigne son nom et son adresse e-mail pour pouvoir l'envoyer."}
      </p>

      {!contact && (
        <label style={{ marginBottom: 8 }}>
          Nom du destinataire *
          <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Prénom Nom" />
        </label>
      )}

      <div className="prospection-actions" style={{ marginBottom: 6 }}>
        <button className="action-btn primary" onClick={deviner} disabled={enCours || !identite}>
          {enCours && !candidats ? "Recherche et vérification..." : "Déduire l'adresse depuis le nom"}
        </button>
        <span className="prospection-meta">Utilise le format des adresses connues de l&apos;entreprise, puis la vérifie (Hunter).</span>
      </div>

      {candidats && (
        <div style={{ marginBottom: 10 }}>
          {infoVerif && <p className="prospection-erreur">{infoVerif}</p>}
          {candidats.map((c) => (
            <div key={c.email} className="prospection-contact">
              <span>
                <b>{c.email}</b>
                <span className={c.verification === "invalide" ? "prospection-erreur" : "prospection-meta"}>
                  {" "}
                  — {libelleVerification(c.verification)}
                </span>
              </span>
              <button
                className="prospection-link-btn"
                disabled={enCours || c.verification === "invalide"}
                onClick={() =>
                  enregistrer(c.email, {
                    origine: "devine",
                    source_email: `Adresse déduite du format ${c.patron} du domaine ${domaine ?? ""}${c.verification === "valide" ? ", vérifiée par Hunter.io" : ""}`.trim(),
                    verification: c.verification,
                  })
                }
              >
                Utiliser cette adresse
              </button>
            </div>
          ))}
          {candidats.every((c) => c.verification === "invalide") ? (
            <p className="prospection-erreur" style={{ marginTop: 6 }}>
              Toutes les adresses testées sur {domaine} sont refusées : le nom ou le domaine est peut-être incorrect. Vérifie le site de
              l&apos;entreprise, ou saisis l&apos;adresse à la main si tu la connais.
            </p>
          ) : (
            candidats.every((c) => c.verification !== "valide") && (
              <p className="prospection-meta" style={{ marginTop: 6 }}>
                Aucune adresse confirmée par la vérification : tu peux en utiliser une quand même si tu la juges plausible, ou saisir
                l&apos;adresse à la main.
              </p>
            )
          )}
        </div>
      )}

      <div className="filter-group-label" style={{ margin: "10px 0 6px" }}>
        Ou saisir l&apos;adresse à la main
      </div>
      <div className="prospection-contact-form">
        <input type="email" placeholder="E-mail professionnel" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="text" placeholder="Source de l'adresse *" value={source} onChange={(e) => setSource(e.target.value)} />
      </div>
      <button className="action-btn" style={{ marginTop: 8 }} onClick={enregistrerSaisie} disabled={enCours}>
        Enregistrer l&apos;adresse
      </button>
      {erreur && <p className="prospection-erreur" style={{ marginTop: 8 }}>{erreur}</p>}
    </div>
  );
}
