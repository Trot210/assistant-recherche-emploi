-- Planification fiable des tâches automatiques, depuis la base de données.
--
-- Pourquoi : les tâches planifiées de GitHub Actions ne sont pas ponctuelles. Sur ce
-- dépôt, la synchronisation « toutes les 20 minutes » ne s'est exécutée que quelques
-- fois par jour : un envoi programmé aurait pu partir avec des heures de retard.
-- pg_cron (inclus dans Supabase) appelle les mêmes routes à la minute près.
--
-- Prérequis, à faire UNE fois avant ce script (ne pas l'écrire dans ce fichier) :
--   select vault.create_secret('<la valeur de CRON_SECRET>', 'cron_secret');
-- Le secret reste dans le coffre de Supabase (Vault) ; les tâches ci-dessous le lisent.
--
-- Les tâches GitHub restent en secours : chaque route est protégée contre le double
-- traitement (réservation atomique des envois, un seul traitement du matin par jour).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Remplace d'éventuelles versions précédentes de ces tâches.
select cron.unschedule(jobid) from cron.job where jobname in ('le-rayon-envois', 'le-rayon-quotidien', 'le-rayon-sync', 'le-rayon-nettoyage');

-- Envois programmés : toutes les minutes.
select cron.schedule('le-rayon-envois', '* * * * *', $$
  select net.http_post(
    url := 'https://assistantance-recherche-emploi.vercel.app/api/cron/envois',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);

-- Traitement du matin : 5 h 15 UTC (6 h 15 à Paris l'hiver, 7 h 15 l'été).
select cron.schedule('le-rayon-quotidien', '15 5 * * *', $$
  select net.http_post(
    url := 'https://assistantance-recherche-emploi.vercel.app/api/cron/quotidien',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);

-- Synchronisation des offres : toutes les 20 minutes.
select cron.schedule('le-rayon-sync', '*/20 * * * *', $$
  select net.http_post(
    url := 'https://assistantance-recherche-emploi.vercel.app/api/offres/sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);

-- Nettoyage quotidien de l'historique technique de pg_cron (il grossit à chaque passage).
select cron.schedule('le-rayon-nettoyage', '30 3 * * *', $$
  delete from cron.job_run_details where end_time < now() - interval '3 days';
$$);
