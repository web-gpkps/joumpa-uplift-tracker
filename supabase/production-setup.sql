-- JOUMPA Uplifting Action Tracker: one-time PRODUCTION setup. NOT a migration; `supabase db push` ignores it.
--
-- Run in the production project's SQL editor (as postgres), after:
--   1. `supabase db push` has applied every file in supabase/migrations/
--   2. the app is deployed on Vercel and /api/sync/run answers
--
-- Replace the two placeholders below first. Never commit the real values:
--   <APP_URL>      e.g. https://joumpa-uplift.vercel.app   (no trailing slash)
--   <SYNC_SECRET>  the same value as the SYNC_SECRET env var on Vercel
--
-- What this wires up (docs/SPEC.md, "When it runs"):
--   * pg_cron every minute -> pg_net POST <APP_URL>/api/sync/run   (the backstop)
--   * the debounced AFTER STATEMENT change-ping (migration 20261007100700) starts working as soon
--     as pg_net and both Vault secrets exist; until then it is a silent no-op.

-- 1. Extensions (also possible from Dashboard > Database > Extensions).
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- 2. Vault secrets read by private.sync_ping() and by the cron job below.
select vault.create_secret('<APP_URL>/api/sync/run', 'sync_run_url', 'JOUMPA: Sheets sync endpoint');
select vault.create_secret('<SYNC_SECRET>', 'sync_secret', 'JOUMPA: bearer for /api/sync/run');

-- 3. Every-minute sync run. The lease in sync_state makes overlapping runs harmless.
select cron.schedule(
  'joumpa-sync-every-minute',
  '* * * * *',
  $job$
    select net.http_post(
      url                  := (select decrypted_secret from vault.decrypted_secrets where name = 'sync_run_url'),
      headers              := jsonb_build_object(
                                'Content-Type',  'application/json',
                                'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sync_secret')
                              ),
      body                 := jsonb_build_object('source', 'cron'),
      timeout_milliseconds := 30000
    )
    where exists (select 1 from vault.decrypted_secrets where name = 'sync_run_url');
  $job$
);

-- 4. Housekeeping: pg_cron logs every run (1,440 rows/day). Keep 7 days.
select cron.schedule(
  'joumpa-cron-log-cleanup',
  '17 3 * * *',
  $job$ delete from cron.job_run_details where end_time < now() - interval '7 days' $job$
);

-- ---------------------------------------------------------------------------------------------
-- Checks
--   select jobid, jobname, schedule, active from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 10;
--   select id, status_code, error_msg, created from net._http_response order by created desc limit 10;
--   select last_success_at, last_error, failures, last_ping_at from public.sync_state;
--
-- Rotate the secret (then update SYNC_SECRET on Vercel and redeploy):
--   select vault.update_secret((select id from vault.secrets where name = 'sync_secret'), '<NEW_SYNC_SECRET>');
-- Change the URL:
--   select vault.update_secret((select id from vault.secrets where name = 'sync_run_url'), '<APP_URL>/api/sync/run');
-- Pause / remove:
--   select cron.unschedule('joumpa-sync-every-minute');
--   select cron.unschedule('joumpa-cron-log-cleanup');
--
-- First admin (after creating the user in Dashboard > Authentication > Users; sign-up is disabled):
--   insert into public.admins (user_id, email)
--   select id, email from auth.users where email = '<ADMIN_EMAIL>';
