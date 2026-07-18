/**
 * Terrace buzz client — the dark-launch contract and the device token.
 *
 * The critical invariant while BUZZ_API_URL is unset: the feature is fully
 * inert — no UI, no network. These tests pin that, so the flag can't be
 * half-on by accident.
 */
// Jest hoists jest.mock() above ES imports, so require() here is intentional
// (same pattern as sunLogStore.test.ts).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { BUZZ_API_URL, fetchBuzz, getDeviceToken, isBuzzEnabled, postCheckin } from '@/src/lib/buzz';

describe('dark-launch flag', () => {
  test('feature is disabled until a worker URL is configured', () => {
    // When this assertion starts failing, the feature is being lit up —
    // make sure the privacy-label update ships in the same release.
    if (BUZZ_API_URL === '') {
      expect(isBuzzEnabled()).toBe(false);
    } else {
      expect(isBuzzEnabled()).toBe(true);
      expect(BUZZ_API_URL).toMatch(/^https:\/\//);
    }
  });

  test('disabled client never touches the network', async () => {
    if (isBuzzEnabled()) return; // covered by live smoke tests instead
    // No fetch mock installed: a network attempt would throw in jest.
    await expect(fetchBuzz(1)).resolves.toBeNull();
    await expect(postCheckin(1)).resolves.toBeNull();
  });
});

describe('device token', () => {
  test('has UUID shape and is stable across calls', async () => {
    const a = await getDeviceToken();
    const b = await getDeviceToken();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(b).toBe(a);
  });
});
