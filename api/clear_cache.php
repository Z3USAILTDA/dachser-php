<?php
// api/clear_cache.php
// Clears OPcache on the host to force reload of PHP files

header('Content-Type: text/plain');

if (function_exists('opcache_reset')) {
    if (opcache_reset()) {
        echo "SUCCESS: OPcache reset successfully!\n";
    } else {
        echo "ERROR: Failed to reset OPcache.\n";
    }
} else {
    echo "ERROR: opcache_reset function does not exist.\n";
}
