"use client";

import { useCallback, useEffect, useState } from "react";
import { formaterUsd } from "@/lib/anthropic/tarifs";

interface Quotas {
  claude: { depenseMoisUsd: number; plafondUsd: number; appels: number; parFonction: { fonction: string; coutUsd: number; appels: number }[] } | null;
  hunter: {
    recherches: { utilisees: number; disponibles: number };
    verifications: { utilisees: number; disponibles: number };
  } | null;
}

// Ce qui reste à dépenser : estimation de ce que l'application a coûté en appels
// à Claude ce mois-ci (avec un plafond réglable) et crédits Hunter restants.
// L'estimation ne compte que les appels faits depuis le suivi ; la facture
// officielle reste celle de la console Anthropic.
export default function CoutClaude({ detail = false }: { detail?: boolean }) {
  const [quotas, setQuotas] = useState<Quotas | null>(null);
  const [edition, setEdition] = useState(false);
  const [plafond, setPlafond] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const res = await fetch("/api/quotas").catch(() => null);
    if (res?.ok) setQuotas((await res.json()) as Quotas);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function enregistrer() {
    const valeur = Number(plafond.replace(",", "."));
    if (!Number.isFinite(valeur) || valeur < 0) return setErreur("Saisis un montant en dollars (0 = pas de plafond)");
    setErreur(null);
    const res = await fetch("/api/quotas", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plafond_claude_usd: valeur }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setErreur(data.error ?? "Erreur");
    setEdition(false);
    charger();
  }

  if (!quotas || (!quotas.claude && !quotas.hunter)) return null;
  const { claude, hunter } = quotas;
  const atteint = claude && claude.plafondUsd > 0 && claude.depenseMoisUsd >= claude.plafondUsd;

  return (
    <div className="prospection-meta" style={{ marginBottom: 14 }}>
      {claude && (
        <span className={atteint ? "prospection-erreur" : undefined}>
          Claude ce mois-ci : environ {formaterUsd(claude.depenseMoisUsd)}
          {claude.plafondUsd > 0 ? ` sur ${formaterUsd(claude.plafondUsd)} de plafond` : " (sans plafond)"}
          {atteint && " — plafond atteint, les nouvelles rédactions sont bloquées"}
        </span>
      )}
      {claude && !edition && (
        <>
          {" "}
          <button className="prospection-link-btn" onClick={() => { setPlafond(String(claude.plafondUsd)); setEdition(true); }}>
            Modifier le plafond
          </button>
        </>
      )}
      {edition && (
        <span>
          {" "}
          <input
            type="text"
            inputMode="decimal"
            value={plafond}
            onChange={(e) => setPlafond(e.target.value)}
            aria-label="Plafond mensuel en dollars"
            style={{ width: 70 }}
          />{" "}
          $ <button className="prospection-link-btn" onClick={enregistrer}>Enregistrer</button>{" "}
          <button className="prospection-link-btn" onClick={() => setEdition(false)}>Annuler</button>
        </span>
      )}
      {hunter && (
        <span>
          {claude ? " · " : ""}
          Hunter : {hunter.recherches.disponibles - hunter.recherches.utilisees} recherche(s) et{" "}
          {hunter.verifications.disponibles - hunter.verifications.utilisees} vérification(s) restantes
        </span>
      )}
      {erreur && <span className="prospection-erreur"> {erreur}</span>}
      {detail && claude && claude.parFonction.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {claude.parFonction.map((f) => (
            <div key={f.fonction}>
              {f.fonction} : {formaterUsd(f.coutUsd)} ({f.appels} appel{f.appels > 1 ? "s" : ""})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
