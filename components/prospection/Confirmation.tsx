"use client";

export interface ActionConfirmation {
  libelle: string;
  onClick: () => void;
  // Geste irréversible : bouton en rouge.
  danger?: boolean;
  // Texte propre à cette action (quand plusieurs gestes sont proposés).
  explication?: string;
}

interface Props {
  texte?: string;
  actions: ActionConfirmation[];
  enCours: boolean;
  erreur: string | null;
  onAnnuler: () => void;
  // Texte du bouton pendant l'action (par défaut « Suppression... »).
  libelleEnCours?: string;
}

// Confirmation en ligne, dans la carte concernée : le texte dit exactement ce
// qui sera supprimé et ce qui est conservé avant tout clic irréversible.
export default function Confirmation({ texte, actions, enCours, erreur, onAnnuler, libelleEnCours = "Suppression..." }: Props) {
  return (
    <div className="prospection-confirmation" role="alertdialog" aria-live="polite">
      {texte && <p>{texte}</p>}
      {actions.map((a) => (
        <div key={a.libelle} className="prospection-confirmation-choix">
          {a.explication && <p>{a.explication}</p>}
          <button className={`action-btn${a.danger ? " danger" : ""}`} onClick={a.onClick} disabled={enCours}>
            {enCours ? libelleEnCours : a.libelle}
          </button>
        </div>
      ))}
      <button className="prospection-link-btn" onClick={onAnnuler} disabled={enCours}>
        Annuler
      </button>
      {erreur && <p className="prospection-erreur">{erreur}</p>}
    </div>
  );
}
