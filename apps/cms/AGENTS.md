# apps/cms

WordPress + WooCommerce + Polylang backend, run via Docker. This is the source of truth for products, orders, customers, and translated content. The Next.js storefront in [`apps/web`](../web) consumes it through `@shop/sdk`.

## Stack

- **WordPress 6.7** on PHP 8.3 + Apache (`Dockerfile`).
- **MariaDB 11** for storage.
- **WooCommerce** for products / cart / orders. Exposed at `/wp-json/wc/store/v1/*` (public Store API) and `/wp-json/wc/v3/*` (REST API).
- **Polylang** for `en` / `fa` translations. Persian is the default site language.
- **wp-cli** sidecar (`docker compose run wpcli wp …`).

## Layout

- `Dockerfile` — extends the official `wordpress` image; adds wp-cli and a must-use bootstrap plugin.
- `docker-compose.yml` — `db` (MariaDB) + `wordpress` + `wpcli` services.
- `mu-bootstrap.php` — must-use plugin baked into the image. On every admin request it installs and activates WooCommerce + Polylang if they're missing. Idempotent.
- `wp-content/themes/shop/` — custom theme (host-mounted; edit and refresh).
- `wp-content/plugins/` — host-mounted plugin directory (mounted as `…/plugins/local` inside the container so it doesn't shadow auto-installed plugins).
- `wp-content/mu-plugins/` — host-mounted MU plugins for site-specific tweaks.
- `.env.example` — copy to `.env` (git-ignored) and adjust ports / passwords.

## Commands

```sh
just cms-up      # boot WP + DB in the background
just cms-down    # stop containers (preserves volumes)
just cms-reset   # nuke volumes and start fresh (loses DB + uploads)
just cms-logs    # tail wordpress logs
just cms-wp ARG  # forward ARG to wp-cli inside the container
```

After first boot, the admin UI is at `http://localhost:8080/wp-admin/`. Complete the install wizard (the `mu-bootstrap.php` plugin only runs after WordPress is installed and the admin is loaded once).

## Invariants

- **Do not commit `wp_data` / `db_data` volumes** — they're Docker named volumes, not bind mounts. The `.gitignore` keeps any stray local files out.
- **Do not commit `.env`** — only `.env.example` is tracked.
- **Theme + custom plugin code goes in `wp-content/themes/shop/` and `wp-content/mu-plugins/`** — both are bind-mounted from the host, so they survive container rebuilds and are version-controlled.
- **WooCommerce + Polylang are auto-installed via `mu-bootstrap.php`** — don't commit them into `wp-content/plugins/`. If you need to pin a specific version, edit the bootstrap to install from a URL instead of the WP plugin directory.
- **Schema changes are made through the WordPress admin or wp-cli**, not by editing the database directly.
