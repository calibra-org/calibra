-- Provision the dedicated `glitchtip` database alongside the dev + test databases on first
-- volume init. The per-spin GlitchTip instance (docker-compose.glitchtip.yml) connects to
-- this database with the same `calibra` user; volume + project isolation make the database
-- per-spin without spinning a second Postgres container.
--
-- Re-runs only on `just db-reset` (volume rebuild) or `pnpm spin stop <slug> --purge`.

CREATE DATABASE glitchtip OWNER calibra;
GRANT ALL PRIVILEGES ON DATABASE glitchtip TO calibra;
