/**
 * Purchase state — RevenueCat IAP entitlement for Zonnie Pro.
 *
 * Single source of truth for whether the current user has an active Pro
 * entitlement. All components that gate Pro features should read `isPro`
 * from this store. Nothing else should import from `react-native-purchases`
 * directly — go through this store.
 *
 * ─── Entitlement model ───────────────────────────────────────────────────
 *
 * RevenueCat uses an "entitlement" as the paywall key. We have one:
 *
 *   Entitlement ID : "pro"
 *   Products that unlock it:
 *     - zonnie_pro_monthly_2 (€0.99/mo  auto-renewable subscription)
 *     - zonnie_pro_yearly    (€5.99/yr  auto-renewable subscription)
 *     - zonnie_pro_lifetime_nc (€17.99    non-consumable one-time purchase)
 *
 * Create these in App Store Connect → In-App Purchases, then map them to
 * the "pro" entitlement in the RevenueCat dashboard. The store only ever
 * checks the entitlement — it never needs to know which product unlocked it.
 *
 * ─── Offering model ──────────────────────────────────────────────────────
 *
 * One offering called "default" containing all three packages. ProPaywall
 * fetches the current offering so prices are always live from the store
 * (RevenueCat can A/B test offerings without a code change).
 *
 * ─── Lifecycle ───────────────────────────────────────────────────────────
 *
 * 1. App cold-starts → `app/_layout.tsx` calls `usePurchaseStore.getState().configure()`.
 * 2. `configure()` calls `Purchases.configure()` with the API key, then
 *    calls `hydrate()` to fetch CustomerInfo from the RevenueCat SDK cache
 *    (instant — no network needed on re-launch once the SDK has cached it).
 * 3. `isPro` is set. All gated components read it synchronously after hydration.
 * 4. When the user taps "Buy" → `purchasePackage(pkg)`.
 * 5. When the user taps "Restore" → `restorePurchases()`.
 * 6. Both update `isPro` from the returned CustomerInfo.
 *
 * ─── Environment ─────────────────────────────────────────────────────────
 *
 * The API key lives in `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (set in EAS Secrets
 * and in your local `.env`). Using `EXPO_PUBLIC_` makes it available in the
 * JS bundle via `process.env`. RevenueCat public API keys are safe to
 * include in the bundle — they are not secret keys.
 *
 * ─── Sandbox testing ─────────────────────────────────────────────────────
 *
 * On the iOS Simulator, StoreKit is available in Xcode's StoreKit test
 * environment. On a physical device, use a Sandbox tester account (set up
 * in App Store Connect → Users and Access → Sandbox Testers). RevenueCat
 * automatically detects sandbox vs production environments.
 *
 * ─── Errors ──────────────────────────────────────────────────────────────
 *
 * `purchasePackage` and `restorePurchases` surface errors as `PurchaseError`:
 *
 *   type PurchaseError =
 *     | { code: 'cancelled' }          // user tapped Cancel — not shown as an alert
 *     | { code: 'network' }            // no internet
 *     | { code: 'already_purchased' }  // subscription is active (treat as success)
 *     | { code: 'unknown'; message: string }
 *
 * The calling component (ProPaywall) handles UI for each case.
 */

import { create } from 'zustand';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOfferings,
  type PurchasesPackage,
} from 'react-native-purchases';
import { Platform } from 'react-native';

// ─── Public entitlement ID ────────────────────────────────────────────────────
// Must match the entitlement ID in your RevenueCat dashboard exactly.
const ENTITLEMENT_ID = 'pro';

// ─── Error shape ──────────────────────────────────────────────────────────────
export type PurchaseErrorCode =
  | 'cancelled'
  | 'network'
  | 'already_purchased'
  | 'unknown';

export interface PurchaseError {
  code: PurchaseErrorCode;
  message?: string;
}

// ─── State shape ─────────────────────────────────────────────────────────────
interface PurchaseState {
  /**
   * True when the user has an active "pro" entitlement — either from a
   * live subscription or a lifetime purchase. This is the only field
   * gating components need to read.
   */
  isPro: boolean;

  /**
   * True after `configure()` has finished and `isPro` reflects the
   * persisted entitlement state. Prevents a flash of locked UI on
   * users who have already purchased.
   */
  hydrated: boolean;

  /**
   * True while a purchase or restore is in progress. ProPaywall uses this
   * to show a loading spinner and disable the buy buttons.
   */
  isLoading: boolean;

  /**
   * The current RevenueCat offering, fetched once after configure().
   * Null until loaded or if the fetch fails (ProPaywall falls back to
   * hardcoded prices when null — never crashes).
   */
  offerings: PurchasesOfferings | null;

  /**
   * The last purchase/restore error. Cleared at the start of each new
   * purchase attempt. ProPaywall reads this to display an alert.
   */
  error: PurchaseError | null;

  // ── Actions ──────────────────────────────────────────────────────────

  /**
   * Call once on app launch from `app/_layout.tsx` BEFORE any gated
   * component renders. Safe to call multiple times — no-ops after first call.
   */
  configure: () => Promise<void>;

  /**
   * Re-fetch CustomerInfo from RevenueCat and update `isPro`. Called by
   * configure() and also available for manual refresh (e.g. after the user
   * returns from the App Store).
   */
  hydrate: () => Promise<void>;

  /**
   * Purchase a specific package from the current offering.
   * Returns `null` on success, a `PurchaseError` on failure.
   * ProPaywall passes the package it wants to buy — never raw product IDs.
   */
  purchasePackage: (pkg: PurchasesPackage) => Promise<PurchaseError | null>;

  /**
   * Restore previous purchases (App Store Restore Purchases flow).
   * Returns `null` on success, a `PurchaseError` on failure.
   */
  restorePurchases: () => Promise<PurchaseError | null>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract `isPro` from a CustomerInfo object. */
function isProFromCustomerInfo(info: CustomerInfo): boolean {
  return (
    info.entitlements.active[ENTITLEMENT_ID] !== undefined &&
    info.entitlements.active[ENTITLEMENT_ID].isActive
  );
}

/**
 * Normalise whatever RevenueCat throws into a PurchaseError.
 * RevenueCat errors have a `code` number on them; we map the most
 * important ones to our simpler string codes.
 */
function normalisePurchaseError(err: unknown): PurchaseError {
  if (typeof err !== 'object' || err === null) {
    return { code: 'unknown', message: String(err) };
  }

  // RevenueCat exposes error codes as numeric constants on
  // Purchases.PURCHASES_ERROR_CODE — check for the ones we handle.
  const rcErr = err as { code?: number; message?: string };

  // 1 = PURCHASE_CANCELLED_ERROR
  if (rcErr.code === 1) return { code: 'cancelled' };

  // 18 = NETWORK_ERROR
  if (rcErr.code === 18) return { code: 'network', message: 'No internet connection. Please try again.' };

  // 7 = PRODUCT_ALREADY_PURCHASED_ERROR
  // 14 = RECEIPT_ALREADY_IN_USE_ERROR (the subscription is active on another Apple ID)
  if (rcErr.code === 7 || rcErr.code === 14) return { code: 'already_purchased' };

  return {
    code: 'unknown',
    message: rcErr.message ?? 'Something went wrong. Please try again.',
  };
}

// ─── Store ───────────────────────────────────────────────────────────────────

/** Whether configure() has already been called this session. */
let _configured = false;

export const usePurchaseStore = create<PurchaseState>((set, get) => ({
  isPro: false,
  hydrated: false,
  isLoading: false,
  offerings: null,
  error: null,

  // ── configure ──────────────────────────────────────────────────────────
  configure: async () => {
    // Guard: only configure once per app session.
    if (_configured) return;
    _configured = true;

    // RevenueCat is iOS/Android only — silently no-op on web
    // (e.g. Expo Go web preview, unit tests).
    if (Platform.OS === 'web') {
      set({ hydrated: true });
      return;
    }

    const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;

    if (!apiKey) {
      // Development fallback — no key means we're running without IAP.
      // isPro stays false, hydrated flips true so gated components render
      // (locked) rather than spinning forever.
      if (__DEV__) {
        console.warn(
          '[PurchaseStore] EXPO_PUBLIC_REVENUECAT_IOS_KEY is not set. ' +
          'IAP disabled. Add it to your .env file to test purchases.',
        );
      }
      set({ hydrated: true });
      return;
    }

    try {
      // Enable verbose SDK logging in development so you can see what
      // RevenueCat is doing in the Expo logs. Suppressed in production.
      if (__DEV__) {
        Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      }

      Purchases.configure({ apiKey });

      // Hydrate Pro status from the SDK's local cache — instant, no network.
      await get().hydrate();

      // Fetch current offerings in the background — ProPaywall needs them
      // to display live prices. Failures are non-fatal: ProPaywall falls
      // back to hardcoded display prices if offerings is null.
      Purchases.getOfferings()
        .then((offerings) => {
          if (__DEV__) {
            console.log('[PurchaseStore] Offerings loaded:', JSON.stringify(offerings?.current?.availablePackages?.map(p => p.packageType)));
          }
          set({ offerings });
        })
        .catch((err: unknown) => {
          if (__DEV__) {
            console.warn('[PurchaseStore] Failed to fetch offerings:', err);
          }
        });
    } catch (err) {
      // If configure itself throws (e.g. in an Expo Go build that doesn't
      // have the native module), mark as hydrated so the app doesn't block.
      if (__DEV__) {
        console.warn('[PurchaseStore] configure() failed:', err);
      }
      set({ hydrated: true });
    }
  },

  // ── hydrate ────────────────────────────────────────────────────────────
  hydrate: async () => {
    if (Platform.OS === 'web') {
      set({ hydrated: true });
      return;
    }

    try {
      const info = await Purchases.getCustomerInfo();
      set({
        isPro: isProFromCustomerInfo(info),
        hydrated: true,
      });
    } catch (err) {
      // SDK not configured yet, no network — either way, mark hydrated
      // with isPro: false so the app doesn't block on loading state.
      if (__DEV__) {
        console.warn('[PurchaseStore] hydrate() failed:', err);
      }
      set({ hydrated: true });
    }
  },

  // ── purchasePackage ────────────────────────────────────────────────────
  purchasePackage: async (pkg: PurchasesPackage): Promise<PurchaseError | null> => {
    if (Platform.OS === 'web') return null;

    set({ isLoading: true, error: null });

    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const newIsPro = isProFromCustomerInfo(customerInfo);

      set({
        isPro: newIsPro,
        isLoading: false,
      });

      return null; // success
    } catch (err) {
      const purchaseError = normalisePurchaseError(err);

      // Don't surface "cancelled" as a store error — it's not an error,
      // it's the user changing their mind. ProPaywall checks the code.
      if (purchaseError.code !== 'cancelled') {
        set({ error: purchaseError, isLoading: false });
      } else {
        set({ isLoading: false });
      }

      return purchaseError;
    }
  },

  // ── restorePurchases ───────────────────────────────────────────────────
  restorePurchases: async (): Promise<PurchaseError | null> => {
    if (Platform.OS === 'web') return null;

    set({ isLoading: true, error: null });

    try {
      const info = await Purchases.restorePurchases();
      const newIsPro = isProFromCustomerInfo(info);

      set({
        isPro: newIsPro,
        isLoading: false,
      });

      // If restore found nothing, it still succeeds — isPro will be false.
      // ProPaywall checks isPro after this returns to decide what message
      // to show ("Purchases restored" vs "No previous purchases found").
      return null;
    } catch (err) {
      const purchaseError = normalisePurchaseError(err);
      set({ error: purchaseError, isLoading: false });
      return purchaseError;
    }
  },
}));
