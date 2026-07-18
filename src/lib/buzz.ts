/**
 * Terrace buzz — client for the anonymous aggregate check-in counters
 * (community Phase B, FEATURE-RESEARCH-community-Jul2026.md).
 *
 * DARK-LAUNCH FLAG: the whole feature is hidden until BUZZ_API_URL is set
 * to the deployed worker URL (backend/buzz-worker/README.md). Shipping the
 * integration dark lets the backend account step happen independently and
 * the feature light up via a one-line OTA.
 *
 * Privacy: the device id is a random UUID minted on-device, sent only for
 * the server's 24h-expiring dedupe. It is not derived from the hardware,
 * not tied to any account, and resettable by reinstalling the app.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/** Deployed worker URL; '' = feature fully hidden (dark launch). */
export const BUZZ_API_URL = '';

export function isBuzzEnabled(): boolean {
  return BUZZ_API_URL.length > 0;
}

export interface BuzzCounts {
  week: number;
  total: number;
}

const DEVICE_KEY = 'zonnie:buzz:device';
const REQUEST_TIMEOUT_MS = 6000;

let cachedDevice: string | null = null;

/** Random pseudonymous device token (UUID v4 shape, crypto not required). */
export async function getDeviceToken(): Promise<string> {
  if (cachedDevice) return cachedDevice;
  try {
    const stored = await AsyncStorage.getItem(DEVICE_KEY);
    if (stored) {
      cachedDevice = stored;
      return stored;
    }
  } catch {
    // fall through to a fresh token
  }
  const token = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
  cachedDevice = token;
  void AsyncStorage.setItem(DEVICE_KEY, token).catch(() => {});
  return token;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Current counts for a terrace; null on any failure (feature stays quiet). */
export async function fetchBuzz(terraceId: number): Promise<BuzzCounts | null> {
  if (!isBuzzEnabled()) return null;
  try {
    const r = await fetchWithTimeout(`${BUZZ_API_URL}/buzz/${terraceId}`);
    if (!r.ok) return null;
    const d = (await r.json()) as BuzzCounts;
    return { week: Number(d.week) || 0, total: Number(d.total) || 0 };
  } catch {
    return null;
  }
}

/** Send a check-in; returns updated counts or null on failure. */
export async function postCheckin(terraceId: number): Promise<(BuzzCounts & { counted: boolean }) | null> {
  if (!isBuzzEnabled()) return null;
  try {
    const device = await getDeviceToken();
    const r = await fetchWithTimeout(`${BUZZ_API_URL}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terraceId, device }),
    });
    if (!r.ok) return null;
    const d = (await r.json()) as BuzzCounts & { counted: boolean };
    return { week: Number(d.week) || 0, total: Number(d.total) || 0, counted: d.counted === true };
  } catch {
    return null;
  }
}
