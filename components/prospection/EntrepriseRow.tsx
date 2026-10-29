"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { libelleTranche, POSTES_CIBLES } from "@/lib/prospection/secteurs";
import type { EntrepriseStatut } from "@/types/database.types";
import type { ContactEntreprise, Entreprise, Prospection } from "@/types/prospection";

interface Props {
  userId: string;
  entreprise: Entreprise;
  contacts: ContactEntreprise[];
  nbMessages: number;
  onEntrepriseChange: (entreprise: Entreprise) => void;
  onContactAjoute: (contact: ContactEntreprise) => void;
  onContactSupprime: (contactId: string) => void;
  onMessageCree: (prospection: Prospection) => void;
}

const LIBELLES_STATUT: Record<EntrepriseStatut, string> = {
  a_analyser: "À analyser",
  retenue: "Retenue",
  ecartee: "Écartée",
};

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUTRE = "__autre__";

export default function EntrepriseRow({
  userId,
  entreprise,
  contacts,
  nbMessages,
  onEntrepriseChange,
  onContactAjoute,
  onContactSupprime,
  onMessageCree,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [ouvert, setOuvert] = useState(false);
  const [notes, setNotes] = useState(entreprise.notes ?? "");
  const [erreur, setErreur] = useState<string | null>(null);

  const [nouveauContact, setNouveauContact] = useState({ nom: "", poste: "", email: "", source: "" });
  const [poste, setPoste] = useState<string>(POSTES_CIBLES[0]);
  const [posteLibre, setPosteLibre] = useState("");
  const [contactId, setContactId] = useState("");
  const [redaction, setRedaction] = useState(false);

  async function mettreAJour(champs: Partial<Pick<Entreprise, "statut" | "notes">>) {
    setErreur(null);
    const { data, error } = await supabase
      .from("entreprises")
      .update(champs)
      .eq("id", entreprise.id)
      .select()
      .single();
    if (error) {
      setErreur(error.message);
      return;
    }
    onEntrepriseChange(data);
  }

  async function ajouterContact() {
    const { nom, poste: posteContact, email, source } = nouveauContact;
    if (!nom.trim()) return setErreur("Le nom du contact est requis");
    if (email.trim() && !EMAIL_VALIDE.test(email.trim())) return setErreur("Adresse e-mail invalide");
    if (email.trim() && !source.trim()) {
      return setErreur("Indique d'où vient l'adresse (site de l'entreprise, annuaire public...) : c'est la trace qui te permettra de répondre à une demande RGPD");
    }

    setErreur(null);
    const { data, error } = await supabase
      .from("contacts")
      .insert({
        user_id: userId,
        entreprise_id: entreprise.id,
        nom: nom.trim(),
        poste: posteContact.trim() || null,
        email: email.trim() || null,
        source_email: email.trim() ? source.trim() : null,
      })
      .select()
      .single();
    if (error) return setErreur(error.message);

    onContactAjoute(data);
    setNouveauContact({ nom: "", poste: "", email: "", source: "" });
    setContactId(data.id);
  }

  async function supprimerContact(id: string) {
    const { error } = await supabase.from("contacts").delete().eq("id", id);
    if (error) return setErreur(error.message);
    onContactSupprime(id);
    if (contactId === id) setContactId("");
  }

  async function rediger() {
    const posteVise = poste === AUTRE ? posteLibre.trim() : poste;
    if (!posteVise) return setErreur("Précise le poste visé");

    setRedaction(true);
    setErreur(null);
    try {
      const res = await fetch("/api/prospection/generer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entreprise_id: entreprise.id,
          contact_id: contactId || undefined,
          poste_vise: posteVise,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la rédaction");
      onMessageCree(data.prospection);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de la rédaction");
    } finally {
      setRedaction(false);
    }
  }

  return (
    <div className={`prospection-ligne${entreprise.statut === "retenue" ? " ok" : ""}`}>
      <div className="prospection-ligne-tete">
        <div>
          <div className="prospection-titre">{entreprise.nom}</div>
          <div className="prospection-meta">
            {[entreprise.secteur, entreprise.commune, libelleTranche(entreprise.tranche_effectif)]
              .filter(Boolean)
              .join(" · ")}
            {nbMessages > 0 && ` · ${nbMessages} message(s)`}
          </div>
        </div>
        <div className="prospection-actions">
          <select
            value={entreprise.statut}
            onChange={(e) => mettreAJour({ statut: e.target.value as EntrepriseStatut })}
            aria-label={`Statut de ${entreprise.nom}`}
          >
            {(Object.keys(LIBELLES_STATUT) as EntrepriseStatut[]).map((s) => (
              <option key={s} value={s}>
                {LIBELLES_STATUT[s]}
              </option>
            ))}
          </select>
          <button className="action-btn" onClick={() => setOuvert((v) => !v)}>
            {ouvert ? "Fermer" : "Ouvrir"}
          </button>
        </div>
      </div>

      {ouvert && (
        <div className="prospection-detail">
          <label>
            Accroche personnelle (un fait réel sur l&apos;entreprise que tu veux mentionner — sinon le message restera
            sobre)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== (entreprise.notes ?? "") && mettreAJour({ notes: notes.trim() || null })}
              placeholder="ex : leur gamme bio lancée en septembre, un article lu sur leur démarche RSE..."
            />
          </label>

          <div>
            <div className="filter-group-label" style={{ marginBottom: 6 }}>
              Contacts
            </div>
            {contacts.length === 0 && <p className="prospection-meta">Aucun contact pour l&apos;instant.</p>}
            {contacts.map((c) => (
              <div key={c.id} className="prospection-contact">
                <span>
                  <b>{c.nom}</b>
                  {c.poste && ` — ${c.poste}`}
                  {c.email ? ` — ${c.email}` : " — pas d'e-mail"}
                  {c.source_email && <span className="prospection-meta"> (source : {c.source_email})</span>}
                </span>
                <button className="prospection-link-btn" onClick={() => supprimerContact(c.id)}>
                  Supprimer
                </button>
              </div>
            ))}
            <div className="prospection-contact-form" style={{ marginTop: 10 }}>
              <input
                type="text"
                placeholder="Nom *"
                value={nouveauContact.nom}
                onChange={(e) => setNouveauContact({ ...nouveauContact, nom: e.target.value })}
              />
              <input
                type="text"
                placeholder="Poste (ex : Responsable Category Management)"
                value={nouveauContact.poste}
                onChange={(e) => setNouveauContact({ ...nouveauContact, poste: e.target.value })}
              />
              <input
                type="email"
                placeholder="E-mail professionnel"
                value={nouveauContact.email}
                onChange={(e) => setNouveauContact({ ...nouveauContact, email: e.target.value })}
              />
              <input
                type="text"
                placeholder="Source de l'adresse *"
                value={nouveauContact.source}
                onChange={(e) => setNouveauContact({ ...nouveauContact, source: e.target.value })}
              />
            </div>
            <button className="action-btn" style={{ marginTop: 8 }} onClick={ajouterContact}>
              + Ajouter le contact
            </button>
          </div>

          <div>
            <div className="filter-group-label" style={{ marginBottom: 6 }}>
              Rédiger une candidature spontanée
            </div>
            <div className="prospection-form">
              <div className="filter-group">
                <span className="filter-group-label">Poste visé</span>
                <select value={poste} onChange={(e) => setPoste(e.target.value)}>
                  {POSTES_CIBLES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                  <option value={AUTRE}>Autre...</option>
                </select>
              </div>
              {poste === AUTRE && (
                <div className="filter-group">
                  <span className="filter-group-label">Intitulé</span>
                  <input type="text" value={posteLibre} onChange={(e) => setPosteLibre(e.target.value)} />
                </div>
              )}
              <div className="filter-group">
                <span className="filter-group-label">Destinataire</span>
                <select value={contactId} onChange={(e) => setContactId(e.target.value)}>
                  <option value="">Sans contact précis</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </select>
              </div>
              <button className="action-btn primary" onClick={rediger} disabled={redaction}>
                {redaction ? "Rédaction en cours..." : "Rédiger le message"}
              </button>
            </div>
          </div>
        </div>
      )}

      {erreur && <p className="prospection-erreur" style={{ marginTop: 10 }}>{erreur}</p>}
    </div>
  );
}
