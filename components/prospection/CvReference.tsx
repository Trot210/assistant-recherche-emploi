"use client";

import { useRef, useState } from "react";
import type { CvInfo } from "./MessageCard";

interface Props {
  cv: CvInfo | null;
  onChange: () => Promise<void>;
}

// Le CV joint à chaque message : un PDF, enregistré une fois, ouvert ici pour
// être vérifié avant tout envoi.
export default function CvReference({ cv, onChange }: Props) {
  const champ = useRef<HTMLInputElement>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function televerser(fichier: File) {
    setEnvoi(true);
    setErreur(null);
    try {
      const formData = new FormData();
      formData.append("cv", fichier);
      const res = await fetch("/api/profil/cv", { method: "PUT", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de l'envoi du CV");
      await onChange();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de l'envoi du CV");
    } finally {
      setEnvoi(false);
      if (champ.current) champ.current.value = "";
    }
  }

  return (
    <div className="prospection-bloc" style={{ marginBottom: 18 }}>
      <h3>Mon CV joint aux messages</h3>
      <div className="prospection-actions">
        {cv ? (
          <span style={{ fontSize: 13.5 }}>
            {cv.nomFichier}
            {cv.taille ? ` (${Math.round(cv.taille / 1024)} Ko)` : ""}
            {cv.url && (
              <>
                {" — "}
                <a href={cv.url} target="_blank" rel="noopener noreferrer">
                  ouvrir
                </a>
              </>
            )}
          </span>
        ) : (
          <span className="prospection-erreur">Aucun CV enregistré : ajoute ton PDF pour pouvoir envoyer.</span>
        )}
        <button className="action-btn" onClick={() => champ.current?.click()} disabled={envoi}>
          {envoi ? "Envoi..." : cv ? "Remplacer le CV" : "Ajouter mon CV (PDF)"}
        </button>
        <input
          ref={champ}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => e.target.files?.[0] && televerser(e.target.files[0])}
        />
      </div>
      {erreur && <p className="prospection-erreur" style={{ marginTop: 8 }}>{erreur}</p>}
    </div>
  );
}
