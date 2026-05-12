/**
 * Expo config plugin that injects the Google Maps API key into
 * AndroidManifest.xml at prebuild's "apply mods" phase.
 *
 * Why a separate file:
 *   EAS Build evaluates `app.config.ts` BEFORE it injects env vars into
 *   the process environment. So `android.config.googleMaps.apiKey =
 *   process.env.GOOGLE_MAPS_ANDROID_API_KEY` resolves to `undefined` at
 *   that point, Expo's CNG silently drops the meta-data tag, the APK
 *   ships with no key, and Maps fails at runtime with INVALID_ARGUMENT.
 *
 *   Plugins, in contrast, are LOADED at config-eval but their callbacks
 *   FIRE during the prebuild apply-mods phase — at which point env vars
 *   ARE loaded. So reading `process.env.X` inside this callback works.
 *
 *   Plugins must also be referenced by string path (not as inline
 *   function values) — calling `withAndroidManifest` from inside
 *   app.config.ts directly fails EAS CLI's local config read with
 *   "Config _internal.projectRoot isn't defined" because the helper
 *   assumes a project-build context that doesn't exist at config eval.
 *
 * Why .js, not .ts:
 *   Expo's plugin loader reads plugin paths as Node modules. .js avoids
 *   the TypeScript compilation step entirely; the JS in here is plain
 *   enough that types aren't worth the wiring.
 *
 * @param {import('expo/config').ExpoConfig} cfg
 * @returns {import('expo/config').ExpoConfig}
 */
const { withAndroidManifest } = require('expo/config-plugins');

const META_NAME = 'com.google.android.geo.API_KEY';

const withGoogleMapsApiKey = (cfg) =>
  withAndroidManifest(cfg, (modCfg) => {
    const apiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
    if (!apiKey) {
      console.warn(
        '[zonnie] GOOGLE_MAPS_ANDROID_API_KEY undefined inside withAndroidManifest. ' +
          'APK will ship without a Maps key and rendering will fail at runtime.',
      );
      return modCfg;
    }
    const application = modCfg.modResults.manifest.application?.[0];
    if (!application) {
      console.warn(
        '[zonnie] No <application> tag in AndroidManifest to inject Maps key into.',
      );
      return modCfg;
    }
    const metaDataList = application['meta-data'] ?? [];
    const existing = metaDataList.find(
      (md) => md.$ && md.$['android:name'] === META_NAME,
    );
    if (existing) {
      existing.$['android:value'] = apiKey;
    } else {
      metaDataList.push({
        $: {
          'android:name': META_NAME,
          'android:value': apiKey,
        },
      });
      application['meta-data'] = metaDataList;
    }
    console.log(
      `[zonnie] Injected Maps API key into AndroidManifest (${apiKey.length} chars, ends ...${apiKey.slice(-4)})`,
    );
    return modCfg;
  });

module.exports = withGoogleMapsApiKey;
