/**
 * Ensure `.expo/web` exists and is writable BEFORE Expo's icon-generation
 * step needs it.
 *
 * Workaround for an EAS Build issue where `@expo/image-utils` fails with
 * EACCES while creating its image cache during iOS icon generation. The
 * `.expo` directory ends up owned/permissioned in a way that prevents
 * subsequent mkdirs from working.
 *
 * This script runs at THREE points (see package.json scripts):
 *   - `eas-build-pre-install`  — first, before npm install on the EAS worker
 *   - `postinstall`            — second, after npm install
 *   - (manually if needed)
 *
 * Strategy: nuke any pre-existing `.expo` (best-effort — if we don't own it,
 * the rm silently fails) and recreate it as ourselves with permissive perms.
 *
 * Cross-platform: Node-only, no shell semantics. Errors all swallowed —
 * Windows local installs don't need this and shouldn't break.
 */

const fs = require('fs');
const path = require('path');

const expoDir = '.expo';
const webDir = path.join(expoDir, 'web');

// 1. Try to clean up any stale `.expo` from a previous run / a different
//    user. This is the lever that actually fixes EACCES — if we can rm it,
//    we recreate it ourselves with our own perms.
try {
  fs.rmSync(expoDir, { recursive: true, force: true });
} catch {
  // No-op if we can't remove it (e.g., owned by another user). The mkdir
  // below is idempotent; the chmod below is best-effort too.
}

// 2. Create `.expo/web` (mkdir -p semantics). Owner = current user.
try {
  fs.mkdirSync(webDir, { recursive: true });
} catch {}

// 3. Permissive perms so any subsequent process that runs as a different
//    user can still write into the cache. 0o777 = drwxrwxrwx. macOS / Linux.
try {
  fs.chmodSync(expoDir, 0o777);
  fs.chmodSync(webDir, 0o777);
} catch {}
