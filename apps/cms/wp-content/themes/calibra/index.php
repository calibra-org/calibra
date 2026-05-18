<?php
/**
 * Headless theme — no front-end output.
 *
 * The Next.js storefront in apps/web renders all customer-facing pages.
 * WordPress is used purely as a CMS + WooCommerce REST/Store API backend.
 */

if (!defined('ABSPATH')) {
    exit;
}

status_header(404);
nocache_headers();
?><!doctype html>
<html lang="<?php bloginfo('language'); ?>">
<head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <title>calibra CMS</title>
</head>
<body>
    <p>This is the WordPress admin backend. The storefront lives elsewhere.</p>
</body>
</html>
