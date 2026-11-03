"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  libelleTranche,
  secteurPourNaf,
  SECTEURS_CIBLES,
  SEUILS_EFFECTIF,
  ZONES,
} from "@/lib/prospection/secteurs";
import type { Entreprise } from "@/types/prospection";

interface EntrepriseTrouvee {
  siren: string;
  nom: string;
  code_naf: string | null;
  tranche_effectif: string | null;
  adresse: string | null;
  code_postal: string | null;
  commune: string | null;
  departement: string | null;
  deja_importee: boolean;
}

interface Reponse {
  entreprises: EntrepriseTrouvee[];
  pageSuivante: number | null;
}

interface Props {
  userId: string;
  onImportees: (entreprises: Entreprise[]) => void;
}

export default function RechercheEntreprises({ userId, onImportees }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [secteurId, setSecteurId] = useState(SECTEURS_CIBLES[0].id);
  const [zoneId, setZoneId] = useState(ZONES[0].id);
  const [effectifMin, setEffectifMin] = useState("21");
  const [motCle, setMotCle] = useState("");
  // « secteur » : recherche par codes d'activité. « nom » : par nom ou numéro SIREN, toutes activités
  // (pour les groupes que le secteur ne retrouve pas : centrales d'achat, coopératives de magasins).
  const [mode, setMode] = useState<"secteur" | "nom">("secteur");
  const [terme, setTerme] = useState("");
  const [effectifNom, setEffectifNom] = useState("");
  // Secteur enregistré à l'import d'une recherche par nom : « auto » = d'après l'activité de l'entreprise.
  const [secteurImport, setSecteurImport] = useState("auto");
  const [resultat, setResultat] = useState<Reponse | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const secteur = SECTEURS_CIBLES.find((s) => s.id === secteurId)!;

  // ajouter = true : « Voir la suite » complète la liste au lieu de la remplacer.
  async function rechercher(page = 1, ajouter = false) {
    setEnCours(true);
    setErreur(null);
    setInfo(null);
    try {
      const zone = ZONES.find((z) => z.id === zoneId)!;
      const params =
        mode === "nom"
          ? new URLSearchParams({ mode: "nom", q: terme.trim(), page: String(page) })
          : new URLSearchParams({
              secteur: secteurId,
              departements: zone.departements.join(","),
              effectif_min: effectifMin,
              page: String(page),
            });
      if (mode === "nom" && effectifNom) params.set("effectif_min", effectifNom);
      if (mode === "secteur" && motCle.trim()) params.set("q", motCle.trim());

      const res = await fetch(`/api/prospection/entreprises/recherche?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la recherche");
      if (ajouter && resultat) {
        const dejaLa = new Set(resultat.entreprises.map((e) => e.siren));
        setResultat({
          entreprises: [...resultat.entreprises, ...data.entreprises.filter((e: EntrepriseTrouvee) => !dejaLa.has(e.siren))],
          pageSuivante: data.pageSuivante,
        });
      } else {
        setResultat(data);
        setSelection(new Set());
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de la recherche");
    } finally {
      setEnCours(false);
    }
  }

  function basculer(siren: string) {
    setSelection((precedente) => {
      const suivante = new Set(precedente);
      if (suivante.has(siren)) suivante.delete(siren);
      else suivante.add(siren);
      return suivante;
    });
  }

  // Secteur enregistré avec l'entreprise : celui de la recherche, ou (recherche par nom) celui choisi,
  // sinon celui déduit de son activité, sinon aucun.
  function secteurEnregistre(codeNaf: string | null): string | null {
    if (mode === "secteur") return secteur.libelle;
    if (secteurImport === "aucun") return null;
    if (secteurImport !== "auto") return SECTEURS_CIBLES.find((s) => s.id === secteurImport)?.libelle ?? null;
    return secteurPourNaf(codeNaf)?.libelle ?? null;
  }

  async function importer() {
    if (!resultat || selection.size === 0) return;
    setEnCours(true);
    setErreur(null);
    try {
      const lignes = resultat.entreprises
        .filter((e) => selection.has(e.siren) && !e.deja_importee)
        .map((e) => ({
          user_id: userId,
          siren: e.siren,
          nom: e.nom,
          code_naf: e.code_naf,
          secteur: secteurEnregistre(e.code_naf),
          tranche_effectif: e.tranche_effectif,
          adresse: e.adresse,
          code_postal: e.code_postal,
          commune: e.commune,
          departement: e.departement,
        }));

      const { data, error } = await supabase
        .from("entreprises")
        .upsert(lignes, { onConflict: "user_id,siren", ignoreDuplicates: true })
        .select();
      if (error) throw new Error(error.message);

      onImportees(data ?? []);
      setInfo(`${data?.length ?? 0} entreprise(s) ajoutée(s) à ta liste.`);
      // Les entreprises importées passent en « déjà importée » sans relancer
      // la recherche.
      setResultat({
        ...resultat,
        entreprises: resultat.entreprises.map((e) =>
          selection.has(e.siren) ? { ...e, deja_importee: true } : e,
        ),
      });
      setSelection(new Set());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de l'import");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="prospection-bloc">
      <h3>Trouver de nouvelles entreprises</h3>
      <div className="chip-row" style={{ marginBottom: 12 }}>
        {(
          [
            ["secteur", "Par secteur"],
            ["nom", "Par nom ou SIREN"],
          ] as ["secteur" | "nom", string][]
        ).map(([id, libelle]) => (
          <button
            key={id}
            className={`chip${mode === id ? " active" : ""}`}
            onClick={() => {
              setMode(id);
              setResultat(null);
              setSelection(new Set());
              setErreur(null);
              setInfo(null);
            }}
          >
            {libelle}
          </button>
        ))}
      </div>

      {mode === "nom" && (
        <>
          <p className="prospection-meta" style={{ marginBottom: 8 }}>
            Cherche une entreprise précise, toutes activités et toutes zones : utile pour une centrale d&apos;achat ou un groupe que la
            recherche par secteur ne retrouve pas (ex : le nom d&apos;une centrale d&apos;achat, ou son numéro SIREN si tu l&apos;as).
          </p>
          <div className="prospection-form">
            <div className="filter-group">
              <span className="filter-group-label">Nom ou numéro SIREN</span>
              <input
                type="text"
                value={terme}
                onChange={(e) => setTerme(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && terme.trim() && !enCours && rechercher(1)}
                placeholder="ex : nom de la société, ou 123 456 789"
              />
            </div>
            <div className="filter-group">
              <span className="filter-group-label">Taille</span>
              <select value={effectifNom} onChange={(e) => setEffectifNom(e.target.value)}>
                <option value="">Toutes tailles</option>
                {SEUILS_EFFECTIF.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.libelle}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <span className="filter-group-label">Secteur à enregistrer</span>
              <select value={secteurImport} onChange={(e) => setSecteurImport(e.target.value)}>
                <option value="auto">D&apos;après l&apos;activité (sinon non précisé)</option>
                {SECTEURS_CIBLES.filter((s) => s.id !== "sieges").map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.libelle}
                  </option>
                ))}
                <option value="aucun">Non précisé</option>
              </select>
            </div>
            <button className="action-btn primary" onClick={() => rechercher(1)} disabled={enCours || !terme.trim()}>
              {enCours ? "Recherche..." : "Rechercher"}
            </button>
          </div>
        </>
      )}

      {mode === "secteur" && (
      <div className="prospection-form">
        <div className="filter-group">
          <span className="filter-group-label">Secteur</span>
          <select value={secteurId} onChange={(e) => setSecteurId(e.target.value)}>
            {SECTEURS_CIBLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.libelle}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <span className="filter-group-label">Zone</span>
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            {ZONES.map((z) => (
              <option key={z.id} value={z.id}>
                {z.libelle}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <span className="filter-group-label">Taille</span>
          <select value={effectifMin} onChange={(e) => setEffectifMin(e.target.value)}>
            {SEUILS_EFFECTIF.map((s) => (
              <option key={s.code} value={s.code}>
                {s.libelle}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <span className="filter-group-label">
            {secteur.motCleRequis ? "Nom du groupe (requis)" : "Mot-clé (facultatif)"}
          </span>
          <input
            type="text"
            value={motCle}
            onChange={(e) => setMotCle(e.target.value)}
            placeholder={secteur.motCleRequis ? "ex : danone" : "ex : chocolat"}
          />
        </div>
        <button
          className="action-btn primary"
          onClick={() => rechercher(1)}
          disabled={enCours || (secteur.motCleRequis && !motCle.trim())}
        >
          {enCours ? "Recherche..." : "Rechercher"}
        </button>
      </div>
      )}

      {erreur && <p className="prospection-erreur" style={{ marginTop: 12 }}>{erreur}</p>}
      {info && <p className="prospection-info" style={{ marginTop: 12 }}>{info}</p>}

      {resultat && (
        <div style={{ marginTop: 16 }}>
          <p className="prospection-meta">
            {mode === "nom"
              ? `${resultat.entreprises.length} entreprise(s) trouvée(s), tous départements. Le siège est affiché pour chacune.`
              : `${resultat.entreprises.length} entreprise(s) dont le siège est dans la zone choisie.`}{" "}
            Source : base Sirene (données publiques).
          </p>
          {resultat.entreprises.length === 0 && (
            <p className="track-empty">
              {mode === "nom"
                ? "Aucune entreprise ne correspond : vérifie l'orthographe, essaie un nom plus court ou le numéro SIREN."
                : `Aucune entreprise ne correspond${resultat.pageSuivante ? " dans cette tranche de résultats" : ""} — essaie « Voir la suite », une autre zone ou une taille plus petite.`}
            </p>
          )}
          <div className="prospection-liste" style={{ marginTop: 10 }}>
            {resultat.entreprises.map((e) => (
              <label key={e.siren} className="prospection-ligne" style={{ cursor: e.deja_importee ? "default" : "pointer" }}>
                <div className="prospection-ligne-tete">
                  <span>
                    <input
                      type="checkbox"
                      checked={selection.has(e.siren) || e.deja_importee}
                      disabled={e.deja_importee}
                      onChange={() => basculer(e.siren)}
                      style={{ marginRight: 10 }}
                    />
                    <span className="prospection-titre">{e.nom}</span>
                  </span>
                  <span className="status-pill">{e.deja_importee ? "Déjà dans ta liste" : libelleTranche(e.tranche_effectif)}</span>
                </div>
                <div className="prospection-meta" style={{ marginLeft: 26 }}>
                  {[e.commune, e.departement && `(${e.departement})`, e.code_naf].filter(Boolean).join(" · ")}
                </div>
              </label>
            ))}
          </div>
          <div className="prospection-actions" style={{ marginTop: 14 }}>
            <button className="action-btn primary" onClick={importer} disabled={enCours || selection.size === 0}>
              Importer la sélection ({selection.size})
            </button>
            {resultat.pageSuivante !== null && (
              <button
                className="action-btn"
                onClick={() => rechercher(resultat.pageSuivante!, true)}
                disabled={enCours}
              >
                {enCours ? "Recherche..." : "Voir la suite"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
