-- Scheduling support; secrets, jobs and activation are configured separately.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
