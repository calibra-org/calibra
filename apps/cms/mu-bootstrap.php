<?php
/**
 * Plugin Name: shop bootstrap
 * Description: Must-use plugin that installs WooCommerce + Polylang on first boot and registers them.
 *
 * Lives outside the wp-content volume so the host doesn't shadow it. Idempotent — safe to keep
 * running on every request; the file-existence and is_plugin_active() checks short-circuit fast.
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('admin_init', function (): void {
    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/plugin.php';
    require_once ABSPATH . 'wp-admin/includes/plugin-install.php';
    require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';

    $required = [
        'woocommerce/woocommerce.php' => 'woocommerce',
        'polylang/polylang.php'       => 'polylang',
    ];

    foreach ($required as $plugin_file => $slug) {
        $plugin_path = WP_PLUGIN_DIR . '/' . dirname($plugin_file);
        if (!is_dir($plugin_path)) {
            $api = plugins_api('plugin_information', ['slug' => $slug, 'fields' => ['sections' => false]]);
            if (is_wp_error($api)) {
                continue;
            }
            $upgrader = new Plugin_Upgrader(new Automatic_Upgrader_Skin());
            $upgrader->install($api->download_link);
        }

        if (!is_plugin_active($plugin_file) && file_exists(WP_PLUGIN_DIR . '/' . $plugin_file)) {
            activate_plugin($plugin_file);
        }
    }
});
