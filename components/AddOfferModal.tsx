"use client";

import { useState } from "react";

interface Props {
  onFermer: () => void;
  onAjoutee: () => void;
}

export default function AddOfferModal({ onFermer, onAjoutee }: Props) {
  const [titre, setTitre] = useState("");
  const [entreprise, setEntreprise] = useState("");
  const [source, setSource] = useState("LinkedIn");
  const [typeContrat, setTypeContrat] = useState("CDI");
  const [lienOriginal, setLienOriginal] = useState("");
  const [localisation, setLocalisation] = useState("");
  const [description, setDescription] = useState("");
  const [texteColle, setTexteColle] = useState("");
  const [extraction, setExtraction] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function extraireAutomatiquement() {
    if (!texteColle.trim()) return;
    setErreur(null);
    setExtraction(true);
    try {
      const res = await fetch("/api/offres/extraire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texte: texteColle }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de l'extraction");
      const offre = data.offre;
      setTitre(offre.titre ?? "");
      setEntreprise(offre.entreprise ?? "");
      setLocalisation(offre.localisation ?? "");
      if (offre.type_contrat) setTypeContrat(offre.type_contrat);
      setDescription(offre.description ?? "");
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur lors de l'extraction");
    } finally {
      setExtraction(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      const res = await fetch("/api/offres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titre,
          entreprise: entreprise || null,
          source,
          type_contrat: typeContrat || null,
          lien_original: lienOriginal,
          localisation: localisation || null,
          description: description || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de l'ajout");
      onAjoutee();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur lors de l'ajout");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="modal-overlay show" onClick={onFermer}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Ajouter une offre</h2>
        <div className="field">
          <label htmlFor="texte-colle">
            Coller le texte de l&apos;annonce (optionnel — remplit les champs ci-dessous automatiquement)
          </label>
          <textarea
            id="texte-colle"
            placeholder="Copie-colle ici le titre, l'entreprise et la description depuis LinkedIn, Welcome to the Jungle, Indeed..."
            value={texteColle}
            onChange={(e) => setTexteColle(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-outline"
            style={{ marginTop: 8 }}
            onClick={extraireAutomatiquement}
            disabled={extraction || !texteColle.trim()}
          >
            {extraction ? "Extraction..." : "Extraire automatiquement"}
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="titre">Intitulé du poste</label>
            <input id="titre" required value={titre} onChange={(e) => setTitre(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="entreprise">Entreprise</label>
            <input id="entreprise" value={entreprise} onChange={(e) => setEntreprise(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="source">Source</label>
            <input
              id="source"
              list="sources-suggestions"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
            <datalist id="sources-suggestions">
              <option value="LinkedIn" />
              <option value="Indeed" />
              <option value="JobTeaser" />
              <option value="Welcome to the Jungle" />
              <option value="APEC" />
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="type-contrat">Type de contrat</label>
            <input
              id="type-contrat"
              list="type-contrat-suggestions"
              value={typeContrat}
              onChange={(e) => setTypeContrat(e.target.value)}
            />
            <datalist id="type-contrat-suggestions">
              <option value="CDI" />
              <option value="CDD" />
              <option value="V.I.E" />
              <option value="Intérim" />
              <option value="Freelance" />
              <option value="Alternance" />
              <option value="Stage" />
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="lien">Lien vers l&apos;annonce</label>
            <input
              id="lien"
              type="url"
              required
              value={lienOriginal}
              onChange={(e) => setLienOriginal(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="localisation">Localisation</label>
            <input id="localisation" value={localisation} onChange={(e) => setLocalisation(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="description">Description (optionnel, utile pour le scoring)</label>
            <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {erreur && <p className="error-text">{erreur}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={onFermer}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={envoi}>
              {envoi ? "Ajout..." : "Ajouter l'offre"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
