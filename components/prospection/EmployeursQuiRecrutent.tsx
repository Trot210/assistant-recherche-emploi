"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formaterDateFr } from "@/lib/prospection/dates";
import { employeursQuiRecrutent, type EmployeurQuiRecrute } from "@/lib/prospection/recrutement";
import type { Entreprise } from "@/types/prospection";

const JOURS = 30;

interface Props {
  entreprises: Entreprise[];
  onCiblee: (entreprise: Entreprise) => void;
}

// Employeurs qui ont publié, ces 30 derniers jours, des offres sur tes postes
// ciblés. Les cibler ajoute l'entreprise à ta liste avec l'offre déjà repérée :
// tu peux alors postuler, et écrire au responsable du métier si tu le souhaites.
export default function EmployeursQuiRecrutent({ entreprises, onCiblee }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [ouvert, setOuvert] = useState(false);
  const [employeurs, setEmployeurs] = useState<EmployeurQuiRecrute[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const noms = useMemo(() => entreprises.map((e) => e.nom), [entreprises]);

  const charger = useCallback(async () => {
    const depuis = new Date(Date.now() - JOURS * 86_400_000).toISOString();
    const { data, error } = await supabase
      .from("offres")
      .select("titre, entreprise, localisation, lien_original, created_at, alternance, stage")
      .gte("created_at", depuis)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) return setErreur(error.message);
    setEmployeurs(employeursQuiRecrutent(data ?? [], noms));
  }, [supabase, noms]);

  useEffect(() => {
    if (ouvert) charger();
  }, [ouvert, charger]);

  async function cibler(e: EmployeurQuiRecrute) {
    setEnCours(e.marque);
    setErreur(null);
    try {
      const offre = e.offres[0];
      const res = await fetch("/api/prospection/entreprises/depuis-offre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeur: e.employeur, titre: offre.titre, lien: offre.lien }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de l'ajout");
      onCiblee(data.entreprise as Entreprise);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur lors de l'ajout");
    } finally {
      setEnCours(null);
    }
  }

  return (
    <div className="prospection-bloc">
      <h3>Entreprises qui recrutent en ce moment</h3>
      <p className="prospection-meta" style={{ marginBottom: 8 }}>
        Employeurs qui ont publié ces {JOURS} derniers jours des offres sur tes postes ciblés (agences, cabinets, administrations, alternances, stages et freelances exclus).
        Une offre ouverte prouve un besoin réel.
      </p>
      <button className="action-btn" onClick={() => setOuvert((v) => !v)}>
        {ouvert ? "Masquer la liste" : "Voir les entreprises qui recrutent"}
      </button>
      {erreur && <p className="prospection-erreur" style={{ marginTop: 8 }}>{erreur}</p>}
      {ouvert && employeurs === null && !erreur && <p className="prospection-meta" style={{ marginTop: 8 }}>Chargement...</p>}
      {ouvert && employeurs?.length === 0 && (
        <p className="prospection-meta" style={{ marginTop: 8 }}>Aucun nouvel employeur à cibler pour l&apos;instant.</p>
      )}
      {ouvert && employeurs && employeurs.length > 0 && (
        <div className="prospection-liste" style={{ marginTop: 10 }}>
          {employeurs.map((e) => (
            <div key={e.marque} className="prospection-ligne">
              <div className="prospection-ligne-tete">
                <div>
                  <div className="prospection-titre">{e.employeur}</div>
                  {e.offres.map((o) => (
                    <div key={`${o.titre}-${o.lieu}`} className="prospection-meta">
                      {o.lien ? (
                        <a href={o.lien} target="_blank" rel="noopener noreferrer">
                          {o.titre}
                        </a>
                      ) : (
                        o.titre
                      )}
                      {[o.lieu, formaterDateFr(o.date)].filter(Boolean).length > 0 && ` — ${[o.lieu, formaterDateFr(o.date)].filter(Boolean).join(" · ")}`}
                    </div>
                  ))}
                </div>
                <div className="prospection-actions">
                  <button className="action-btn primary" onClick={() => cibler(e)} disabled={enCours !== null}>
                    {enCours === e.marque ? "Ajout..." : "Cibler"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
