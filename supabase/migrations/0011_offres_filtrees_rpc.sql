-- Le dashboard chargeait jusqu'ici l'intégralité des offres de l'utilisateur
-- côté serveur (~5000 lignes) pour filtrer/trier/paginer en mémoire côté
-- client — un modèle qui grossit indéfiniment avec le catalogue. Ces deux
-- fonctions déplacent le filtrage, le tri et la pagination en base : le
-- client ne récupère plus qu'une page de résultats à la fois.
--
-- PostgREST ne sait pas exprimer correctement un filtre "n'a pas de score"
-- ou "candidature absente ou à traiter" sur une relation embarquée en LEFT
-- JOIN (le filtre est silencieusement ignoré sans erreur) — d'où le choix
-- d'une vraie fonction SQL plutôt que des filtres PostgREST chaînés.

-- p_user_id est un paramètre de secours réservé aux scripts de diagnostic
-- exécutés avec la clé service_role (qui n'a pas de auth.uid() propre, donc
-- rien ne remonterait sans lui) — sans danger pour un appel authentifié
-- normal : la fonction tourne "security invoker", donc les RLS de offres/
-- scores/candidatures s'appliquent quand même avec l'identité réelle de
-- l'appelant, quoi que p_user_id prétende demander.
create or replace function public.offres_filtrees(
  p_recherche text default '',
  p_source text default 'Toutes',
  p_contrat text default 'Toutes',
  p_localisation text default 'Toutes',
  p_notation text default 'Toutes',
  p_statut text default 'Toutes',
  p_tri text default 'score-desc',
  p_page int default 1,
  p_taille_page int default 24,
  p_user_id uuid default null
)
returns table (
  id uuid,
  titre text,
  entreprise text,
  source text,
  source_id text,
  lien_original text,
  localisation text,
  date_publication date,
  created_at timestamptz,
  type_contrat text,
  type_contrat_libelle text,
  alternance boolean,
  stage boolean,
  score int,
  points_forts jsonb,
  ecarts jsonb,
  candidature_statut text,
  candidature_date_envoi date,
  candidature_cv_genere_url text,
  candidature_lm_generee_url text,
  candidature_message_motivation text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    o.id, o.titre, o.entreprise, o.source, o.source_id, o.lien_original,
    o.localisation, o.date_publication, o.created_at, o.type_contrat,
    o.type_contrat_libelle, o.alternance, o.stage,
    s.score, s.points_forts, s.ecarts,
    c.statut::text as candidature_statut, c.date_envoi as candidature_date_envoi,
    c.cv_genere_url as candidature_cv_genere_url, c.lm_generee_url as candidature_lm_generee_url,
    c.message_motivation as candidature_message_motivation,
    count(*) over() as total_count
  from public.offres o
  left join public.scores s on s.offre_id = o.id
  left join public.candidatures c on c.offre_id = o.id
  where o.user_id = coalesce(p_user_id, auth.uid())
    and (
      p_recherche = ''
      or (o.titre || ' ' || coalesce(o.entreprise, '')) ilike '%' || p_recherche || '%'
    )
    and (p_source = 'Toutes' or o.source = p_source)
    and (
      case p_contrat
        when 'Alternance' then o.alternance
        when 'Stage' then (not o.alternance and o.stage)
        when 'CDI' then (not o.alternance and not o.stage and o.type_contrat = 'CDI')
        when 'CDD' then (not o.alternance and not o.stage and o.type_contrat = 'CDD')
        when 'Autre' then (
          not o.alternance and not o.stage
          and o.type_contrat is distinct from 'CDI'
          and o.type_contrat is distinct from 'CDD'
        )
        else (not o.alternance and not o.stage)
      end
    )
    and (
      p_localisation = 'Toutes'
      or (
        p_localisation = 'Paris'
        and (o.localisation ~* '\mparis\M' or o.localisation ~* '^75\M')
      )
      or (
        p_localisation = 'IDF'
        and not (o.localisation ~* '\mparis\M' or o.localisation ~* '^75\M')
      )
    )
    and (
      p_notation = 'Toutes'
      or (p_notation = 'NonNotees' and s.score is null)
      or (p_notation = 'Notees' and s.score is not null)
    )
    and (
      case
        when p_statut = 'Envoyees' then (c.statut is not null and c.statut::text <> 'a_traiter')
        else (c.statut is null or c.statut::text = 'a_traiter')
      end
    )
  order by
    case when p_tri = 'score-desc' then coalesce(s.score, -1) end desc,
    case when p_tri = 'score-asc' then coalesce(s.score, 999) end asc,
    o.date_publication desc nulls last,
    o.id
  limit greatest(p_taille_page, 0)
  offset greatest(p_page - 1, 0) * greatest(p_taille_page, 0)
$$;

revoke all on function public.offres_filtrees from public;
grant execute on function public.offres_filtrees to authenticated;

-- Les tuiles de stats du dashboard portent sur "toutes les offres hors
-- stage/alternance" (offresPertinentes), indépendamment des filtres actifs
-- de l'utilisateur — elles ont donc besoin de leur propre agrégat plutôt que
-- de dériver du résultat (déjà filtré/paginé) de offres_filtrees ci-dessus.
create or replace function public.offres_stats(p_user_id uuid default null)
returns table (
  total int,
  fortes int,
  moyenne int,
  documents_prets int,
  non_notees int,
  envoyees int,
  sources text[]
)
language sql
stable
security invoker
set search_path = public
as $$
  with pertinentes as (
    select o.id, s.score, c.cv_genere_url, c.lm_generee_url
    from public.offres o
    left join public.scores s on s.offre_id = o.id
    left join public.candidatures c on c.offre_id = o.id
    where o.user_id = coalesce(p_user_id, auth.uid()) and not o.alternance and not o.stage
  ),
  toutes as (
    select o.id, o.source, c.statut
    from public.offres o
    left join public.candidatures c on c.offre_id = o.id
    where o.user_id = coalesce(p_user_id, auth.uid())
  )
  select
    (select count(*) from pertinentes)::int,
    (select count(*) from pertinentes where coalesce(score, 0) >= 70)::int,
    (select coalesce(round(avg(score)), 0)::int from pertinentes where score is not null),
    (select count(*) from pertinentes where cv_genere_url is not null or lm_generee_url is not null)::int,
    (select count(*) from pertinentes where score is null)::int,
    (select count(*) from toutes where statut is not null and statut::text <> 'a_traiter')::int,
    (select coalesce(array_agg(distinct source), array[]::text[]) from toutes)
$$;

revoke all on function public.offres_stats from public;
grant execute on function public.offres_stats to authenticated;
