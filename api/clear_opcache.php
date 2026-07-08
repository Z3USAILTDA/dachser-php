<?php
// api/clear_opcache.php
if (function_exists('opcache_reset')) {
    if (opcache_reset()) {
        echo "SUCCESS: OPcache has been reset successfully!";
    } else {
        echo "ERROR: Failed to reset OPcache.";
    }
} else {
    echo "ERROR: opcache_reset function does not exist.";
}
