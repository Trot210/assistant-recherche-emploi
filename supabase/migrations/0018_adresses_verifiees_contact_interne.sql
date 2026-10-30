-- Lot 2 : adresses devinées et vérifiées, contact interne.
-- Migration additive : aucune donnée existante n'est modifiée ni supprimée.

-- Une adresse peut maintenant être « devinée » à partir du format des adresses
-- de l'entreprise.
alter table public.contacts drop constraint if exists contacts_origine_check;
alter table public.contacts
  add constraint contacts_origine_check
  check (origine in ('manuel', 'page_publique', 'hunter', 'devine'));

-- Résultat de la dernière vérification de l'adresse (Hunter) et sa date.
-- « accept_all » : le serveur du destinataire accepte toute adresse, la
-- vérification ne peut donc rien garantir.
alter table public.contacts
  add column if not exists email_verification text
    check (email_verification in ('valide', 'accept_all', 'inconnu', 'invalide')),
  add column if not exists email_verifie_at timestamptz;

-- Quelqu'un que l'utilisateur connaît dans l'entreprise (cooptation possible).
alter table public.entreprises
  add column if not exists contact_interne text;
