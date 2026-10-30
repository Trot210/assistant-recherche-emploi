import type { Fiche } from "@/types/fiche";
import type { ContactEntrepriseInsert } from "@/types/prospection";

// Contacts à créer à partir de l'analyse d'une entreprise (pages publiques).
// Toutes les lignes ont EXACTEMENT les mêmes colonnes : quand on insère plusieurs lignes
// d'un coup, une colonne absente d'une ligne mais présente dans une autre y est envoyée à
// NULL (et non à sa valeur par défaut), ce qui violait la contrainte « generique non nul »
// dès que l'analyse trouvait à la fois une adresse générique et des contacts nommés.
export function contactsDepuisFiche(params: {
  userId: string;
  entrepriseId: string;
  fiche: Pick<Fiche, "adresse_candidature" | "contacts_publics">;
  dejaConnus: { nom: string; email: string | null }[];
}): ContactEntrepriseInsert[] {
  const { userId, entrepriseId, fiche, dejaConnus } = params;
  const emailsConnus = new Set(dejaConnus.map((c) => c.email?.toLowerCase()).filter(Boolean));
  const nomsConnus = new Set(dejaConnus.map((c) => c.nom.toLowerCase()));
  const lignes: ContactEntrepriseInsert[] = [];

  // L'adresse générique n'est ajoutée que si elle est confirmée par un extrait cité ;
  // sinon elle reste affichée dans la fiche, à vérifier.
  const adresse = fiche.adresse_candidature;
  if (adresse?.confirmee && !emailsConnus.has(adresse.email.toLowerCase())) {
    lignes.push({
      user_id: userId,
      entreprise_id: entrepriseId,
      nom: "Recrutement",
      poste: "Candidatures spontanées",
      email: adresse.email,
      generique: true,
      origine: "page_publique",
      source_url: adresse.source_url,
      source_email: `Page publique de l'entreprise : ${adresse.source_url}`,
    });
  }

  for (const contact of fiche.contacts_publics) {
    if (nomsConnus.has(contact.nom.toLowerCase())) continue;
    if (contact.email && emailsConnus.has(contact.email.toLowerCase())) continue;
    lignes.push({
      user_id: userId,
      entreprise_id: entrepriseId,
      nom: contact.nom,
      poste: contact.poste,
      email: contact.email,
      generique: false,
      origine: "page_publique",
      source_url: contact.source_url,
      source_email: contact.email ? `Page publique : ${contact.source_url}` : null,
    });
  }

  return lignes;
}
