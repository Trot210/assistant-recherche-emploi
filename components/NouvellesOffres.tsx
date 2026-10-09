"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  enregistrerVisite,
  lireDerniereVisite,
  selectionnerNouvellesPertinentes,
} from "@/lib/nouvelles-offres";
import type { OffreProteeHeuristique } from "@/lib/insights-utils";

interface Props {
  onOuvrirOffre: (offreId: string) => void;
}

// PostgREST plafonne à 1000 lignes par requête : au-delà, le décompte est
// affiché avec un "+" plutôt que présenté comme exact.
const PLAFOND = 1000;
const NB_AFFICHEES = 8;

export default function NouvellesOffres({ onOuvrirOffre }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [depuis, setDepuis] = useState<string | null>(null);
  const [nouvelles, setNouvelles] = useState<OffreProteeHeuristique[]>([]);
  const [plafonne, setPlafonne] = useState(false);
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    let annule = false;

    async function charger() {
      const derniere = lireDerniereVisite(window.localStorage);
      if (!derniere) {
        // Première visite sur ce navigateur : rien à comparer, on pose le
        // point de départ pour les prochaines.
        enregistrerVisite(window.localStorage, new Date());
        return;
      }

      const [{ data: profil }, { data: offres, error }] = await Promise.all([
        supabase.from("profil").select("preferences").maybeSingle(),
        supabase
          .from("offres")
          .select("id, titre")
          .eq("alternance", false)
          .eq("stage", false)
          .gt("created_at", derniere)
          .order("created_at", { ascending: false })
          .limit(PLAFOND),
      ]);
      if (annule || error || !offres) return;

      const brut = (profil?.preferences as { intitules_cibles?: unknown } | null)?.intitules_cibles;
      const intitules = Array.isArray(brut) ? brut.filter((x): x is string => typeof x === "string") : [];

      setDepuis(derniere);
      setPlafonne(offres.length >= PLAFOND);
      setNouvelles(selectionnerNouvellesPertinentes(offres, intitules));
    }

    charger();
    return () => {
      annule = true;
    };
  }, [supabase]);

  if (!depuis || nouvelles.length === 0) return null;

  function marquerCommeVu() {
    enregistrerVisite(window.localStorage, new Date());
    setNouvelles([]);
  }

  const dateLisible = new Date(depuis).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

  return (
    <div className="nouvelles-offres">
      <div className="nouvelles-offres-tete">
        <p className="nouvelles-offres-titre">
          <b>
            {nouvelles.length}
            {plafonne ? "+" : ""}
          </b>{" "}
          nouvelle{nouvelles.length > 1 ? "s" : ""} offre{nouvelles.length > 1 ? "s" : ""} pertinente
          {nouvelles.length > 1 ? "s" : ""} depuis ta dernière visite ({dateLisible})
        </p>
        <div className="nouvelles-offres-actions">
          <button type="button" className="action-btn" onClick={() => setOuvert((v) => !v)}>
            {ouvert ? "Masquer" : "Voir les meilleures"}
          </button>
          <button type="button" className="action-btn" onClick={marquerCommeVu}>
            Marquer comme vu
          </button>
        </div>
      </div>
      {ouvert && (
        <div className="nouvelles-offres-liste">
          {nouvelles.slice(0, NB_AFFICHEES).map((o) => (
            <button
              type="button"
              key={o.id}
              className="nouvelles-offres-ligne"
              onClick={() => onOuvrirOffre(o.id)}
            >
              {o.titre}
            </button>
          ))}
          {nouvelles.length > NB_AFFICHEES && (
            <p className="nouvelles-offres-suite">
              + {nouvelles.length - NB_AFFICHEES} autre{nouvelles.length - NB_AFFICHEES > 1 ? "s" : ""} —
              retrouve-les avec le tri « plus récentes ».
            </p>
          )}
        </div>
      )}
    </div>
  );
}
