/**
 * Pre-create the `.expo/web` cache directory before prebuild runs.
 *
 * Workaround for an EAS Build flake where `@expo/image-utils` fails with
 * EACCES when trying to mkdir its cache during iOS icon generation. By
 * having `npm install`'s postinstall create the directory FIRST (as the
 * `expo` user, with default umask), prebuild's later mkdir is a no-op
 * instead of a permission collision.
 *
 * Cross-platform: pure Node, no shell-specific syntax. Errors swallowed
 * silently — if the directory already exists or we lack perms locally
 * (Windows oddities), it's not fatal.
 */

const fs = require('fs');
const path = require('path');

try {
  fs.mkdirSync(path.join('.expo', 'web'), { recursive: true });
} catch {
  // best-effort
}
