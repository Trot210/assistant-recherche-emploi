"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { choisirMeilleurContact } from "@/lib/prospection/contacts";
import { libelleLangue, suggererLangueContact } from "@/lib/prospection/langue";
import { libelleTranche, POSTES_CIBLES } from "@/lib/prospection/secteurs";
import { libellePolitique, POLITIQUES, estPolitique } from "@/lib/prospection/politique";
import type { EntrepriseStatut, Langue } from "@/types/database.types";
import type { VerificationOffres } from "@/types/offres-entreprise";
import type { ContactEntreprise, Entreprise, Prospection } from "@/types/prospection";
import FicheEntreprise from "./FicheEntreprise";
import OffresEntreprise from "./OffresEntreprise";
import TrouverAdresse from "./TrouverAdresse";
import { libelleVerification } from "@/lib/hunter/verification";
import Confirmation from "./Confirmation";
import {
  bilanEntreprise,
  modesProposes,
  texteSuppressionEntreprise,
  type ModeSuppressionEntreprise,
} from "@/lib/prospection/suppression";

interface Props {
  userId: string;
  hunterActif: boolean;
  entreprise: Entreprise;
  contacts: ContactEntreprise[];
  nbMessages: number;
  // Tous les messages de cette entreprise : ils déterminent ce que la suppression conserve.
  messages: Prospection[];
  onRetiree: (entreprise: Entreprise, idsSupprimes: string[]) => void;
  onSupprimee: (entrepriseId: string, idsSupprimes: string[]) => void;
  onEntrepriseChange: (entreprise: Entreprise) => void;
  onContactAjoute: (contact: ContactEntreprise) => void;
  onContactMaj: (contact: ContactEntreprise) => void;
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

// Options des étapes qui peuvent rédiger un message : « sansVerification » passe
// outre une offre déjà publiée, « forcer » outre la politique de l'entreprise.
interface OptionsRedaction {
  sansVerification?: boolean;
  forcer?: boolean;
  // Écrire malgré un contact interne qui pourrait coopter.
  ignorerContactInterne?: boolean;
}

// Le serveur demande une confirmation avant d'écrire (politique de l'entreprise).
class ConfirmationPolitique extends Error {}

export default function EntrepriseRow({
  userId,
  hunterActif,
  entreprise,
  contacts,
  nbMessages,
  messages,
  onRetiree,
  onSupprimee,
  onEntrepriseChange,
  onContactAjoute,
  onContactMaj,
  onContactSupprime,
  onMessageCree,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [ouvert, setOuvert] = useState(false);
  const [notes, setNotes] = useState(entreprise.notes ?? "");
  const [contactInterne, setContactInterne] = useState(entreprise.contact_interne ?? "");
  const [verifContact, setVerifContact] = useState<string | null>(null);
  const [site, setSite] = useState(entreprise.site_web ?? "");
  const [erreur, setErreur] = useState<string | null>(null);

  const [nouveauContact, setNouveauContact] = useState({ nom: "", poste: "", email: "", source: "" });
  const [poste, setPoste] = useState<string>(entreprise.fiche?.postes_suggeres[0]?.poste ?? POSTES_CIBLES[0]);
  const [posteLibre, setPosteLibre] = useState("");
  const [contactId, setContactId] = useState("");
  const [redaction, setRedaction] = useState(false);
  const [suppression, setSuppression] = useState<{ ouverte: boolean; enCours: boolean; erreur: string | null }>({
    ouverte: false,
    enCours: false,
    erreur: null,
  });
  const [langueChoix, setLangueChoix] = useState<"auto" | Langue>("auto");
  const [preparation, setPreparation] = useState<string | null>(null);
  const [analyse, setAnalyse] = useState(false);
  const [rechercheHunter, setRechercheHunter] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationOffres | null>(null);
  const [verifEnCours, setVerifEnCours] = useState(false);
  const [offreBloquante, setOffreBloquante] = useState(false);
  // Ce qu'il faut relancer si tu choisis d'écrire malgré l'offre publiée.
  const [repriseApresOffre, setRepriseApresOffre] = useState<(() => void) | null>(null);
  const [confirmation, setConfirmation] = useState<{ raison: string; relancer: () => void } | null>(null);

  async function mettreAJour(
    champs: Partial<
      Pick<
        Entreprise,
        | "statut"
        | "notes"
        | "site_web"
        | "politique_candidature"
        | "politique_note"
        | "offre_reperee_titre"
        | "offre_reperee_url"
        | "contact_interne"
      >
    >,
  ) {
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

  async function supprimer(mode: ModeSuppressionEntreprise) {
    setSuppression({ ouverte: true, enCours: true, erreur: null });
    try {
      const res = await fetch(`/api/prospection/entreprises/${entreprise.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la suppression");
      if (mode === "supprimer") onSupprimee(entreprise.id, data.supprimes as string[]);
      else onRetiree(data.entreprise as Entreprise, data.supprimes as string[]);
    } catch (e) {
      setSuppression({ ouverte: true, enCours: false, erreur: e instanceof Error ? e.message : "Erreur lors de la suppression" });
    }
  }

  async function enregistrerSite() {
    const saisi = site.trim();
    if (saisi === (entreprise.site_web ?? "")) return;
    if (saisi && !/^(https?:\/\/)?[^\s/]+\.[^\s/]+/.test(saisi)) {
      return setErreur("Adresse de site invalide (exemple : groupe-bel.com)");
    }
    const normalise = saisi ? (saisi.includes("://") ? saisi : `https://${saisi}`) : null;
    setSite(normalise ?? "");
    await mettreAJour({ site_web: normalise });
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

  async function analyser() {
    setAnalyse(true);
    setErreur(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/prospection/entreprises/${entreprise.id}/fiche`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de l'analyse");
      onEntrepriseChange(data.entreprise);
      for (const contact of data.contacts as ContactEntreprise[]) onContactAjoute(contact);
      const suggere = (data.entreprise as Entreprise).fiche?.postes_suggeres[0]?.poste;
      if (suggere) setPoste(suggere);
      setInfo(`Analyse terminée — ${data.contacts.length} contact(s) trouvé(s) sur des pages publiques.`);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de l'analyse");
    } finally {
      setAnalyse(false);
    }
  }

  async function chercherHunter() {
    setRechercheHunter(true);
    setErreur(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/prospection/entreprises/${entreprise.id}/contacts-hunter`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la recherche");
      for (const contact of data.contacts as ContactEntreprise[]) onContactAjoute(contact);
      if (data.entreprise) onEntrepriseChange(data.entreprise as Entreprise);
      const quota = data.quota ? ` Il te reste ${data.quota.disponibles - data.quota.utilisees} recherche(s) ce mois-ci.` : "";
      setInfo(
        data.contacts.length > 0
          ? `${data.contacts.length} contact(s) ajouté(s).${quota}`
          : `Aucun contact pertinent trouvé (${data.trouves} adresse(s) examinée(s)).${quota}`,
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de la recherche");
    } finally {
      setRechercheHunter(false);
    }
  }

  // Adresse trouvée par l'analyse mais non confirmée par un extrait de la page :
  // elle n'est ajoutée qu'après vérification par l'utilisateur.
  async function ajouterAdresseAVerifier() {
    const adresse = entreprise.fiche?.adresse_candidature;
    if (!adresse) return;
    const { data, error } = await supabase
      .from("contacts")
      .insert({
        user_id: userId,
        entreprise_id: entreprise.id,
        nom: "Recrutement",
        poste: "Candidatures spontanées",
        email: adresse.email,
        generique: true,
        origine: "page_publique",
        source_url: adresse.source_url,
        source_email: `Page publique de l'entreprise : ${adresse.source_url} (vérifiée par moi)`,
      })
      .select()
      .single();
    if (error) return setErreur(error.message);
    onContactAjoute(data);
  }

  const bilan = bilanEntreprise(messages, contacts.length);
  const modes = modesProposes(bilan, entreprise.statut);
  const contactChoisi = contacts.find((c) => c.id === contactId);
  const suggestionLangue = contactChoisi
    ? suggererLangueContact(contactChoisi)
    : { langue: "fr" as Langue, raison: "pas de contact choisi" };

  // Demande la rédaction d'un message à valider ; la langue est celle choisie,
  // sinon celle suggérée pour le contact côté serveur.
  async function demanderMessage(
    posteVise: string,
    destinataireId: string,
    langue?: Langue,
    forcer?: boolean,
  ): Promise<Prospection> {
    const res = await fetch("/api/prospection/generer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entreprise_id: entreprise.id,
        contact_id: destinataireId || undefined,
        poste_vise: posteVise,
        langue,
        forcer: forcer || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.code === "politique") throw new ConfirmationPolitique(data.error);
    if (!res.ok) throw new Error(data.error ?? "Erreur lors de la rédaction");
    return data.prospection;
  }

  // Cherche les offres déjà publiées (gratuit). Renvoie vrai si une offre
  // correspondante existe, ou si tu en as repéré une toi-même.
  async function verifierOffres(posteVise: string): Promise<boolean> {
    setVerifEnCours(true);
    try {
      const res = await fetch(`/api/prospection/entreprises/${entreprise.id}/offres`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poste_vise: posteVise }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la recherche d'offres");
      const resultat = data as VerificationOffres;
      setVerification(resultat);
      const trouvee = resultat.offres.length > 0 || Boolean(entreprise.offre_reperee_url || entreprise.offre_reperee_titre);
      setOffreBloquante(trouvee);
      return trouvee;
    } finally {
      setVerifEnCours(false);
    }
  }

  async function enregistrerOffreReperee(titre: string, url: string) {
    await mettreAJour({ offre_reperee_titre: titre || null, offre_reperee_url: url || null });
  }

  async function verifierContact(contact: ContactEntreprise) {
    setVerifContact(contact.id);
    setErreur(null);
    try {
      const res = await fetch(`/api/prospection/contacts/${contact.id}/verifier`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la vérification");
      onContactMaj(data.contact as ContactEntreprise);
      if ((data.contact as ContactEntreprise).email_verification === "invalide" && contactId === contact.id) setContactId("");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de la vérification");
    } finally {
      setVerifContact(null);
    }
  }

  // Un contact interne peut coopter la candidature : on le rappelle avant d'écrire à froid.
  function rappelContactInterne(options: OptionsRedaction, reprise: () => void): boolean {
    if (!entreprise.contact_interne || options.ignorerContactInterne) return false;
    setConfirmation({
      raison: `Tu connais quelqu'un chez ${entreprise.nom} (${entreprise.contact_interne}). Une cooptation passe avant un message à froid : tu peux lui demander de transmettre ton CV.`,
      relancer: reprise,
    });
    return true;
  }

  async function basculerContact(contact: ContactEntreprise) {
    const statut = contact.email_statut === "ok" ? "ne_plus_contacter" : "ok";
    const { data, error } = await supabase.from("contacts").update({ email_statut: statut }).eq("id", contact.id).select().single();
    if (error) return setErreur(error.message);
    onContactMaj(data);
    if (statut !== "ok" && contactId === contact.id) setContactId("");
  }

  async function rediger(options: OptionsRedaction = {}) {
    const posteVise = poste === AUTRE ? posteLibre.trim() : poste;
    if (!posteVise) return setErreur("Précise le poste visé");
    if (rappelContactInterne(options, () => rediger({ ...options, ignorerContactInterne: true }))) return;

    setRedaction(true);
    setErreur(null);
    setConfirmation(null);
    try {
      if (!options.sansVerification && (await verifierOffres(posteVise).catch(() => false))) {
        setRepriseApresOffre(() => () => rediger({ ...options, sansVerification: true }));
        return;
      }
      onMessageCree(
        await demanderMessage(posteVise, contactId, langueChoix === "auto" ? undefined : langueChoix, options.forcer),
      );
    } catch (e) {
      if (e instanceof ConfirmationPolitique) {
        setConfirmation({ raison: e.message, relancer: () => rediger({ ...options, sansVerification: true, forcer: true }) });
      } else {
        setErreur(e instanceof Error ? e.message : "Erreur lors de la rédaction");
      }
    } finally {
      setRedaction(false);
    }
  }

  // Enchaîne tout ce qui peut l'être : analyse, recherche de contacts, choix du
  // destinataire et de la langue, rédaction. Rien n'est envoyé : le message
  // arrive dans « Messages » pour vérification.
  async function toutPreparer(options: OptionsRedaction = {}) {
    setErreur(null);
    setInfo(null);
    setConfirmation(null);
    if (rappelContactInterne(options, () => toutPreparer({ ...options, ignorerContactInterne: true }))) return;
    try {
      let courante = entreprise;
      const tous = [...contacts];

      // D'abord les offres déjà publiées (gratuit) : s'il y en a une, rien n'est
      // dépensé et rien n'est rédigé tant que tu n'as pas choisi.
      if (!options.sansVerification) {
        setPreparation("Recherche des offres déjà publiées...");
        const posteProbable = courante.fiche?.postes_suggeres[0]?.poste ?? (poste === AUTRE ? posteLibre.trim() : poste);
        if (await verifierOffres(posteProbable).catch(() => false)) {
          setRepriseApresOffre(() => () => toutPreparer({ ...options, sansVerification: true }));
          setOuvert(true);
          return;
        }
      }

      if (!courante.fiche) {
        setPreparation("Analyse de l'entreprise...");
        const res = await fetch(`/api/prospection/entreprises/${entreprise.id}/fiche`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Erreur lors de l'analyse");
        courante = data.entreprise as Entreprise;
        onEntrepriseChange(courante);
        for (const contact of data.contacts as ContactEntreprise[]) {
          onContactAjoute(contact);
          tous.push(contact);
        }
      }

      const posteVise = courante.fiche?.postes_suggeres[0]?.poste ?? (poste === AUTRE ? posteLibre.trim() : poste);
      if (!posteVise) throw new Error("Précise le poste visé");
      if ((POSTES_CIBLES as readonly string[]).includes(posteVise)) setPoste(posteVise);

      // Hunter n'est interrogé que s'il manque un contact nominatif joignable :
      // chaque recherche consomme le quota mensuel gratuit.
      const domaine = courante.site_web ?? courante.fiche?.site_web;
      if (hunterActif && domaine && !courante.fiche?.hunter_recherche_at && !tous.some((c) => c.email && !c.generique)) {
        setPreparation("Recherche de contacts (Hunter)...");
        const res = await fetch(`/api/prospection/entreprises/${entreprise.id}/contacts-hunter`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          if (data.entreprise) onEntrepriseChange(data.entreprise as Entreprise);
          for (const contact of data.contacts as ContactEntreprise[]) {
            onContactAjoute(contact);
            tous.push(contact);
          }
        } else {
          setInfo(`Hunter : ${data.error ?? "recherche impossible"}.`);
        }
      }

      const destinataire = choisirMeilleurContact(tous, posteVise);
      if (!destinataire) {
        throw new Error(
          "Aucune adresse e-mail trouvée pour cette entreprise : ajoute un contact avec son e-mail, puis clique sur « Rédiger le message ».",
        );
      }
      setContactId(destinataire.id);

      setPreparation("Rédaction du message...");
      onMessageCree(await demanderMessage(posteVise, destinataire.id, undefined, options.forcer));
    } catch (e) {
      if (e instanceof ConfirmationPolitique) {
        setConfirmation({ raison: e.message, relancer: () => toutPreparer({ ...options, sansVerification: true, forcer: true }) });
      } else {
        setErreur(e instanceof Error ? e.message : "Erreur lors de la préparation");
      }
    } finally {
      setPreparation(null);
    }
  }

  return (
    <div className={`prospection-ligne${entreprise.statut === "retenue" ? " ok" : ""}`}>
      <div className="prospection-ligne-tete">
        <div>
          <div className="prospection-titre">
            {entreprise.nom}
            {entreprise.politique_candidature && (
              <span className="prospection-meta"> · {libellePolitique(entreprise.politique_candidature)}</span>
            )}
          </div>
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
          <button
            className="prospection-croix"
            aria-label={`Retirer ${entreprise.nom}`}
            title="Retirer ou supprimer cette entreprise"
            onClick={() => setSuppression({ ouverte: true, enCours: false, erreur: null })}
          >
            ✕
          </button>
        </div>
      </div>

      {suppression.ouverte && (
        <Confirmation
          actions={modes.map((mode) => ({
            libelle: mode === "retirer" ? "Retirer de la liste" : "Supprimer définitivement",
            danger: mode === "supprimer",
            explication: texteSuppressionEntreprise(entreprise.nom, bilan, mode),
            onClick: () => supprimer(mode),
          }))}
          enCours={suppression.enCours}
          erreur={suppression.erreur}
          onAnnuler={() => setSuppression({ ouverte: false, enCours: false, erreur: null })}
        />
      )}

      {ouvert && (
        <div className="prospection-detail">
          <label>
            Site web de l&apos;entreprise (colle-le ici pour éviter la recherche automatique, qui coûte environ 1 centime)
            <input
              type="text"
              value={site}
              onChange={(e) => setSite(e.target.value)}
              onBlur={enregistrerSite}
              placeholder="ex : groupe-bel.com"
            />
          </label>

          <div className="prospection-actions">
            <button className="action-btn primary" onClick={() => toutPreparer()} disabled={preparation !== null || analyse}>
              {preparation ?? "Tout préparer (analyse, contact, langue, message)"}
            </button>
            {hunterActif && <span className="prospection-meta">Utilise 1 recherche Hunter si aucun contact nominatif n&apos;est connu.</span>}
          </div>

          <div>
            <div className="prospection-actions">
              <button className="action-btn" onClick={analyser} disabled={analyse || preparation !== null}>
                {analyse
                  ? "Analyse en cours (environ 20 s)..."
                  : entreprise.fiche
                    ? "Actualiser l'analyse"
                    : "Analyser l'entreprise"}
              </button>
              {hunterActif && (
                <button
                  className="action-btn"
                  onClick={chercherHunter}
                  disabled={rechercheHunter || !(entreprise.site_web ?? entreprise.fiche?.site_web)}
                  title="Utilise une recherche de ton quota mensuel gratuit Hunter"
                >
                  {rechercheHunter ? "Recherche..." : "Chercher des contacts (Hunter)"}
                </button>
              )}
            </div>
            {entreprise.fiche && <FicheEntreprise fiche={entreprise.fiche} onAjouterAdresse={ajouterAdresseAVerifier} />}
          </div>

          <label>
            Politique de candidature (ce que l&apos;entreprise accepte ; une réponse « CV non conservé » la propose
            automatiquement)
            <select
              value={entreprise.politique_candidature ?? ""}
              onChange={(e) =>
                mettreAJour({ politique_candidature: estPolitique(e.target.value) ? e.target.value : null })
              }
            >
              <option value="">Non précisée</option>
              {POLITIQUES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.libelle}
                </option>
              ))}
            </select>
            {entreprise.politique_candidature && (
              <span className="prospection-meta">{POLITIQUES.find((p) => p.id === entreprise.politique_candidature)?.aide}</span>
            )}
          </label>

          <OffresEntreprise
            entreprise={entreprise}
            verification={verification}
            enCours={verifEnCours}
            bloquant={offreBloquante}
            onVerifier={() => {
              setErreur(null);
              verifierOffres(poste === AUTRE ? posteLibre.trim() : poste).catch((e) =>
                setErreur(e instanceof Error ? e.message : "Erreur lors de la recherche d'offres"),
              );
            }}
            onEcrireQuandMeme={() => {
              setOffreBloquante(false);
              if (repriseApresOffre) repriseApresOffre();
              else toutPreparer({ sansVerification: true });
            }}
            onEnregistrerOffreReperee={enregistrerOffreReperee}
          />

          <label>
            Contact interne (quelqu&apos;un que tu connais dans l&apos;entreprise : nom et façon de le joindre)
            <input
              type="text"
              value={contactInterne}
              onChange={(e) => setContactInterne(e.target.value)}
              onBlur={() => contactInterne.trim() !== (entreprise.contact_interne ?? "") && mettreAJour({ contact_interne: contactInterne.trim() || null })}
              placeholder="ex : Julie Martin, ancienne collègue, joignable sur LinkedIn"
            />
          </label>

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
                  {c.email_statut === "invalide" && <span className="prospection-erreur"> [adresse invalide]</span>}
                  {c.email_statut === "ne_plus_contacter" && <span className="prospection-erreur"> [ne plus contacter]</span>}
                  {c.poste && ` — ${c.poste}`}
                  {c.email ? ` — ${c.email}` : " — pas d'e-mail"}
                  {c.email && (
                    <span className={c.email_verification === "invalide" ? "prospection-erreur" : "prospection-meta"}>
                      {" "}
                      ({libelleVerification(c.email_verification)})
                    </span>
                  )}
                  {c.source_url ? (
                    <span className="prospection-meta">
                      {" "}
                      (
                      <a href={c.source_url} target="_blank" rel="noopener noreferrer">
                        {c.origine === "hunter" ? "Hunter · page source" : "page source"}
                      </a>
                      )
                    </span>
                  ) : (
                    c.source_email && <span className="prospection-meta"> (source : {c.source_email})</span>
                  )}
                </span>
                <span>
                  {hunterActif && c.email && (
                    <>
                      <button className="prospection-link-btn" onClick={() => verifierContact(c)} disabled={verifContact !== null}>
                        {verifContact === c.id ? "Vérification..." : "Vérifier"}
                      </button>{" "}
                    </>
                  )}
                  <button className="prospection-link-btn" onClick={() => basculerContact(c)}>
                    {c.email_statut === "ok" ? "Ne plus contacter" : "Rétablir"}
                  </button>{" "}
                  <button className="prospection-link-btn" onClick={() => supprimerContact(c.id)}>
                    Supprimer
                  </button>
                </span>
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

          <TrouverAdresse userId={userId} entreprise={entreprise} onContactAjoute={onContactAjoute} />

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
                    <option key={c.id} value={c.id} disabled={c.email_statut !== "ok"}>
                      {c.nom}
                      {c.email_statut === "invalide" ? " (adresse invalide)" : c.email_statut === "ne_plus_contacter" ? " (ne plus contacter)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <span className="filter-group-label">Langue</span>
                <select value={langueChoix} onChange={(e) => setLangueChoix(e.target.value as "auto" | Langue)}>
                  <option value="auto">
                    Auto : {libelleLangue(suggestionLangue.langue)} ({suggestionLangue.raison})
                  </option>
                  <option value="fr">Français</option>
                  <option value="en">Anglais</option>
                </select>
              </div>
              <button className="action-btn primary" onClick={() => rediger()} disabled={redaction || preparation !== null}>
                {redaction ? "Rédaction en cours..." : "Rédiger le message"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmation && (
        <div className="prospection-bloc" style={{ marginTop: 10 }}>
          <p className="prospection-erreur">{confirmation.raison}</p>
          <div className="prospection-actions" style={{ marginTop: 8 }}>
            <button className="action-btn primary" onClick={confirmation.relancer}>
              Écrire quand même
            </button>
            <button className="action-btn" onClick={() => setConfirmation(null)}>
              Renoncer
            </button>
          </div>
        </div>
      )}
      {info && <p className="prospection-info" style={{ marginTop: 10 }}>{info}</p>}
      {erreur && <p className="prospection-erreur" style={{ marginTop: 10 }}>{erreur}</p>}
    </div>
  );
}
