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
  const [lienOriginal, setLienOriginal] = useState("");
  const [localisation, setLocalisation] = useState("");
  const [description, setDescription] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

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
