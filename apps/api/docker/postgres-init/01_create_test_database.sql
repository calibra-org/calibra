-- Provision the dedicated `calibra_test` database alongside the dev `calibra` database on first
-- volume init, so `pnpm --filter @calibra/api test` (which points at calibra_test via .env.test)
-- works without manual setup. Re-runs only on `just db-reset` (volume rebuild).

CREATE DATABASE calibra_test;
