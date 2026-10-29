"use client";

import { useRef, useState } from "react";
import type { Langue } from "@/types/database.types";
import type { CvInfo } from "./MessageCard";

interface Props {
  cvs: Record<Langue, CvInfo | null>;
  onChange: () => Promise<void>;
}

const EMPLACEMENTS: { langue: Langue; libelle: string }[] = [
  { langue: "fr", libelle: "CV français — joint aux messages en français" },
  { langue: "en", libelle: "CV anglais — joint aux messages en anglais" },
];

function Emplacement({
  langue,
  libelle,
  cv,
  onChange,
}: {
  langue: Langue;
  libelle: string;
  cv: CvInfo | null;
  onChange: () => Promise<void>;
}) {
  const champ = useRef<HTMLInputElement>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function televerser(fichier: File) {
    setEnvoi(true);
    setErreur(null);
    try {
      const formData = new FormData();
      formData.append("cv", fichier);
      formData.append("langue", langue);
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
    <div style={{ marginBottom: 10 }}>
      <div className="filter-group-label" style={{ marginBottom: 4 }}>
        {libelle}
      </div>
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
          {envoi ? "Envoi..." : cv ? "Remplacer" : "Ajouter (PDF)"}
        </button>
        <input
          ref={champ}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => e.target.files?.[0] && televerser(e.target.files[0])}
        />
      </div>
      {erreur && <p className="prospection-erreur" style={{ marginTop: 6 }}>{erreur}</p>}
    </div>
  );
}

// Les CV joints : un PDF par langue, choisi automatiquement d'après la langue
// du message, et ouvrable ici pour être vérifié avant tout envoi.
export default function CvReference({ cvs, onChange }: Props) {
  return (
    <div className="prospection-bloc" style={{ marginBottom: 18 }}>
      <h3>Mes CV joints aux messages</h3>
      {EMPLACEMENTS.map((e) => (
        <Emplacement key={e.langue} langue={e.langue} libelle={e.libelle} cv={cvs[e.langue]} onChange={onChange} />
      ))}
    </div>
  );
}
