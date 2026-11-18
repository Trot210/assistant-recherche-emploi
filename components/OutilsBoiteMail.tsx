"use client";

import { useState } from "react";
import { formaterDateFr } from "@/lib/prospection/dates";
import type { ExpediteurLettres } from "@/lib/prospection/lettres-information";

interface BilanArchivage {
  apercu: boolean;
  total: number;
  lignes: { expediteur: string; sujet: string; date: string | null }[];
  archives: number;
  erreurs: string[];
}

async function appeler<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Erreur");
  return data as T;
}

// Trois outils à la demande, jamais automatiques : se désinscrire des lettres d'information (le site ouvre le
// lien, c'est toi qui confirmes), archiver les vieux mails lus (aperçu d'abord, rien n'est supprimé) et
// télécharger une sauvegarde de tes données.
export default function OutilsBoiteMail({ imapActif }: { imapActif: boolean }) {
  const [lettres, setLettres] = useState<ExpediteurLettres[] | null>(null);
  const [lettresEnCours, setLettresEnCours] = useState(false);
  const [erreurLettres, setErreurLettres] = useState<string | null>(null);

  const [archivage, setArchivage] = useState<BilanArchivage | null>(null);
  const [archivageEnCours, setArchivageEnCours] = useState(false);
  const [erreurArchivage, setErreurArchivage] = useState<string | null>(null);

  async function chargerLettres() {
    setLettresEnCours(true);
    setErreurLettres(null);
    try {
      setLettres((await appeler<{ lettres: ExpediteurLettres[] }>("/api/courrier/lettres")).lettres);
    } catch (e) {
      setErreurLettres(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLettresEnCours(false);
    }
  }

  async function archiver(apercu: boolean) {
    setArchivageEnCours(true);
    setErreurArchivage(null);
    try {
      setArchivage(
        await appeler<BilanArchivage>("/api/courrier/archivage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apercu }),
        }),
      );
    } catch (e) {
      setErreurArchivage(e instanceof Error ? e.message : "Erreur");
    } finally {
      setArchivageEnCours(false);
    }
  }

  return (
    <details className="prospection-bloc" style={{ marginTop: 18 }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Outils de la boîte mail et sauvegarde</summary>

      {!imapActif && <p className="prospection-meta" style={{ marginTop: 12 }}>La lecture de la boîte mail n&apos;est pas configurée : seules les sauvegardes sont disponibles.</p>}

      {imapActif && (
      <div style={{ marginTop: 12 }}>
        <h3>Lettres d&apos;information</h3>
        <p className="prospection-meta">Les lettres reçues ces 30 derniers jours, avec le lien de désinscription quand le mail en fournit un. Le site ne se désinscrit jamais à ta place.</p>
        <button type="button" className="action-btn" disabled={lettresEnCours} onClick={chargerLettres}>
          {lettresEnCours ? "Lecture..." : lettres ? "Actualiser" : "Voir mes lettres d'information"}
        </button>
        {erreurLettres && <p className="prospection-erreur">{erreurLettres}</p>}
        {lettres && lettres.length === 0 && <p className="prospection-meta">Aucune lettre d&apos;information ces 30 derniers jours.</p>}
        {lettres && lettres.length > 0 && (
          <div className="prospection-liste" style={{ marginTop: 8 }}>
            {lettres.map((l) => (
              <div key={l.adresse} className="prospection-ligne">
                <div className="prospection-titre">{l.nom}</div>
                <div className="prospection-meta">
                  {l.nombre} mail{l.nombre > 1 ? "s" : ""} · {l.adresse}
                </div>
                <div style={{ marginTop: 6 }}>
                  {l.lien ? (
                    <a href={l.lien} target="_blank" rel="noopener noreferrer" className="action-btn">
                      Se désinscrire
                    </a>
                  ) : (
                    <span className="prospection-meta">Pas de lien de désinscription dans ces mails.</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {imapActif && (
      <div style={{ marginTop: 18 }}>
        <h3>Archiver les vieux mails lus</h3>
        <p className="prospection-meta">
          Les mails déjà lus de ta boîte de réception reçus il y a plus de 30 jours sont rangés dans « Tous les messages » : rien n&apos;est supprimé. Les mails non lus, étoilés ou qui demandent
          encore une action restent en place.
        </p>
        <button type="button" className="action-btn" disabled={archivageEnCours} onClick={() => archiver(true)}>
          {archivageEnCours && !archivage ? "Lecture..." : "Voir ce qui serait archivé"}
        </button>
        {erreurArchivage && <p className="prospection-erreur">{erreurArchivage}</p>}
        {archivage?.erreurs.map((e) => (
          <p key={e} className="prospection-erreur">
            {e}
          </p>
        ))}
        {archivage && archivage.apercu && (
          <div style={{ marginTop: 8 }}>
            <p className="prospection-meta">
              {archivage.total === 0 ? "Rien à archiver." : `${archivage.total} mail${archivage.total > 1 ? "s" : ""} à archiver${archivage.total > archivage.lignes.length ? ` (${archivage.lignes.length} à ce passage)` : ""}. Exemples :`}
            </p>
            {archivage.lignes.slice(0, 8).map((l, i) => (
              <div key={i} className="prospection-meta">
                {l.date ? `${formaterDateFr(l.date)} · ` : ""}
                {l.expediteur} — {l.sujet || "(sans objet)"}
              </div>
            ))}
            {archivage.lignes.length > 0 && (
              <button type="button" className="action-btn primary" style={{ marginTop: 8 }} disabled={archivageEnCours} onClick={() => archiver(false)}>
                {archivageEnCours ? "Archivage..." : `Archiver ces ${archivage.lignes.length} mails`}
              </button>
            )}
          </div>
        )}
        {archivage && !archivage.apercu && <p className="prospection-meta">{archivage.archives} mail{archivage.archives > 1 ? "s" : ""} archivé{archivage.archives > 1 ? "s" : ""}.</p>}
      </div>
      )}

      <div style={{ marginTop: 18 }}>
        <h3>Sauvegarde</h3>
        <p className="prospection-meta">
          Un fichier avec tes entreprises, contacts, messages, candidatures et réglages, à garder sur ton ordinateur. Il ne contient ni mot de passe ni clé d&apos;accès, mais des coordonnées de
          contacts : range-le comme un document personnel.
        </p>
        <a href="/api/export" className="action-btn" download>
          Télécharger une sauvegarde
        </a>
      </div>
    </details>
  );
}
