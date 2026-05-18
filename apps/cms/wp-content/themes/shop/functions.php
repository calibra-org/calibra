<?php
/**
 * Theme bootstrap. Keeps the headless backend minimal — only the hooks the storefront actually needs.
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Disable the front-end search UI for the headless backend. Search is handled by the storefront via
 * the Store API; keeping WP's built-in search exposed only invites bots.
 */
add_filter('option_blog_public', '__return_zero');

/**
 * Allow CORS from the storefront origins so the Store API is reachable from the Next.js app during
 * dev and from the production frontend. Tighten this in production.
 */
add_action('rest_api_init', function (): void {
    remove_filter('rest_pre_serve_request', 'rest_send_cors_headers');
    add_filter('rest_pre_serve_request', function (bool $served) {
        $allowed = array_filter(array_map('trim', explode(',', (string) getenv('ALLOWED_ORIGINS'))));
        $origin = get_http_origin();
        if ($origin !== null && in_array($origin, $allowed, true)) {
            header("Access-Control-Allow-Origin: {$origin}");
            header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
            header('Access-Control-Allow-Headers: Authorization, Content-Type, Cart-Token, X-WP-Nonce');
            header('Access-Control-Expose-Headers: Cart-Token, X-WP-Total, X-WP-TotalPages');
            header('Access-Control-Allow-Credentials: true');
        }
        return $served;
    });
}, 15);
