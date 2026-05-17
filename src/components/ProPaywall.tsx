/**
 * ProPaywall — bottom sheet shown when a free user taps a locked feature.
 *
 * Rendered as a plain Gorhom BottomSheet (not BottomSheetModal) using the
 * same pattern as TerraceDetailSheet — the modal portal silently fails on
 * TestFlight builds, so inline render with imperative snap is the reliable
 * pattern for this project.
 *
 * ─── Usage ───────────────────────────────────────────────────────────────
 *
 * Mount it once in `app/index.tsx` alongside TerraceDetailSheet:
 *
 *   import { ProPaywall } from '@/src/components/ProPaywall';
 *   import { useProPaywallStore } from '@/src/store/proPaywallStore';
 *
 *   // Inside your screen component:
 *   <ProPaywall />
 *
 * Open it from anywhere with:
 *
 *   import { useProPaywallStore } from '@/src/store/proPaywallStore';
 *   const showPaywall = useProPaywallStore((s) => s.show);
 *   showPaywall();                         // generic "unlock Pro"
 *   showPaywall('time_scrubber');          // feature-specific headline
 *
 * ─── Feature triggers ────────────────────────────────────────────────────
 *
 * Pass a FeatureTrigger key so the paywall headline matches what the user
 * just tried to do:
 *
 *   'time_scrubber'   → "Drag to any hour"
 *   'ratings'         → "See Google ratings"
 *   'busyness'        → "See live busyness"
 *   'photos'          → "See terrace photos"
 *   'favourites'      → "Save unlimited favourites"
 *   'widget'          → "Add a home screen widget"
 *   'notifications'   → "Get sunny-day alerts"
 *   'best_window'     → "See the best visit window"
 *   'share'           → "Share a terrace card"
 *   undefined         → generic "Unlock Zonnie Pro"
 *
 * ─── Pricing ─────────────────────────────────────────────────────────────
 *
 * Prices are fetched live from RevenueCat (via purchaseStore.offerings) so
 * they're always accurate. If offerings haven't loaded yet we fall back to
 * hardcoded display strings — the paywall never crashes or shows a spinner.
 *
 * Three tiers, yearly highlighted as "Best value":
 *   - Monthly   €0.99/mo
 *   - Yearly    €5.99/yr   ← visually dominant
 *   - Lifetime  €17.99 once
 *
 * ─── Error handling ──────────────────────────────────────────────────────
 *
 * After purchase/restore, the sheet reads the error from purchaseStore:
 *   - 'cancelled'        → silent dismiss, no alert
 *   - 'network'          → Alert with retry option
 *   - 'already_purchased'→ treats as success (isPro flips true)
 *   - 'unknown'          → Alert with message
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { PACKAGE_TYPE } from 'react-native-purchases';
import type { PurchasesPackage } from 'react-native-purchases';
import { create } from 'zustand';

import { haptics } from '@/src/lib/haptics';
import { usePurchaseStore } from '@/src/store/purchaseStore';
import {
  fonts,
  fontSizes,
  palette,
  radii,
  spacing,
} from '@/src/theme/tokens';

// ─── Feature trigger store ────────────────────────────────────────────────────
// Tiny store so any component can open the paywall without prop-drilling.

export type FeatureTrigger =
  | 'time_scrubber'
  | 'ratings'
  | 'busyness'
  | 'photos'
  | 'favourites'
  | 'widget'
  | 'notifications'
  | 'best_window'
  | 'share';

interface ProPaywallState {
  isOpen: boolean;
  trigger: FeatureTrigger | undefined;
  show: (trigger?: FeatureTrigger) => void;
  hide: () => void;
}

export const useProPaywallStore = create<ProPaywallState>((set) => ({
  isOpen: false,
  trigger: undefined,
  show: (trigger) => set({ isOpen: true, trigger }),
  hide: () => set({ isOpen: false, trigger: undefined }),
}));

// ─── Feature-specific copy ────────────────────────────────────────────────────

interface TriggerCopy {
  emoji: string;
  headline: string;
  sub: string;
}

function triggerCopy(trigger: FeatureTrigger | undefined): TriggerCopy {
  switch (trigger) {
    case 'time_scrubber':
      return {
        emoji: '🕐',
        headline: 'Drag to any hour',
        sub: 'Scrub through the day and watch sun scores update live for every terrace.',
      };
    case 'ratings':
      // v1.2 model: ratings are FREE (pre-imported into the static
      // dataset). This trigger now anchors the PlacesCard's
      // hours + phone + website lock. Renaming the union member
      // would break OTA-shipped builds that hardcode 'ratings'
      // as the string trigger, so keep the key, refresh the copy.
      return {
        emoji: '🕐',
        headline: "See today's hours & contact",
        sub: 'Live opening hours, phone, and website pulled fresh from Google for every terrace.',
      };
    case 'busyness':
      return {
        emoji: '👥',
        headline: 'See live busyness',
        sub: 'Know which terraces are quiet before you leave. Sunny and empty is the goal.',
      };
    case 'photos':
      return {
        emoji: '📸',
        headline: 'See terrace photos',
        sub: 'Swipe through photos before you commit to the walk.',
      };
    case 'favourites':
      return {
        emoji: '🤍',
        headline: 'Save unlimited favourites',
        sub: 'Keep all your regular spots saved and get a push when they\'re about to be sunny.',
      };
    case 'widget':
      return {
        emoji: '📱',
        headline: 'Add a home screen widget',
        sub: 'Top 3 sunniest terraces near you, always one glance away.',
      };
    case 'notifications':
      return {
        emoji: '🔔',
        headline: 'Get sunny-day alerts',
        sub: 'A morning heads-up when tomorrow looks like a good terrace day.',
      };
    case 'best_window':
      return {
        emoji: '✨',
        headline: 'See the best visit window',
        sub: 'We calculate the perfect 2–3 hour slot for each terrace so you don\'t have to scrub.',
      };
    case 'share':
      return {
        emoji: '↗️',
        headline: 'Share a terrace card',
        sub: 'A beautiful card with the sun score, best window, and Zonnie branding. Made for Stories.',
      };
    default:
      return {
        emoji: '☀️',
        headline: 'Unlock Zonnie Pro',
        sub: 'The full Amsterdam sun experience — time scrubber, ratings, busyness, photos, widgets and more.',
      };
  }
}

// ─── Pro feature list (shown in all paywall states) ───────────────────────────

const PRO_FEATURES = [
  { emoji: '🕐', label: 'Time scrubber — drag to any hour' },
  { emoji: '⭐', label: 'Google ratings inline' },
  { emoji: '🤍', label: 'Unlimited favourites + push alerts' },
] as const;

// ─── Pricing fallbacks (shown while offerings load) ───────────────────────────

const FALLBACK_PRICES = {
  monthly: '€0.99',
  yearly: '€5.99',
  lifetime: '€17.99',
} as const;

// ─── Component ────────────────────────────────────────────────────────────────

export function ProPaywall() {
  const ref = useRef<BottomSheet>(null);
  const isOpen = useProPaywallStore((s) => s.isOpen);
  const trigger = useProPaywallStore((s) => s.trigger);
  const hide = useProPaywallStore((s) => s.hide);

  const isPro = usePurchaseStore((s) => s.isPro);
  const isLoading = usePurchaseStore((s) => s.isLoading);
  const offerings = usePurchaseStore((s) => s.offerings);
  const purchasePackage = usePurchaseStore((s) => s.purchasePackage);
  const restorePurchases = usePurchaseStore((s) => s.restorePurchases);

  // Which tier the user has highlighted — defaults to yearly (best value).
  const [selectedType, setSelectedType] = useState<'monthly' | 'yearly' | 'lifetime'>('yearly');

  // Imperative open/close — same pattern as TerraceDetailSheet.
  useEffect(() => {
    if (isOpen) {
      ref.current?.snapToIndex(0);
    } else {
      ref.current?.close();
    }
  }, [isOpen]);

  // If the user just became Pro (purchase succeeded), close the paywall.
  useEffect(() => {
    if (isPro && isOpen) {
      haptics.success();
      hide();
    }
  }, [isPro, isOpen, hide]);

  // ── Package helpers ────────────────────────────────────────────────────

  function packageForType(type: 'monthly' | 'yearly' | 'lifetime'): PurchasesPackage | null {
    if (!offerings?.current?.availablePackages) return null;
    const pkgType =
      type === 'monthly'  ? PACKAGE_TYPE.MONTHLY   :
      type === 'yearly'   ? PACKAGE_TYPE.ANNUAL     :
                            PACKAGE_TYPE.LIFETIME;
    return offerings.current.availablePackages.find((p) => p.packageType === pkgType) ?? null;
  }

  function priceStringForType(type: 'monthly' | 'yearly' | 'lifetime'): string {
    const pkg = packageForType(type);
    if (!pkg) return FALLBACK_PRICES[type];
    return pkg.product.priceString;
  }

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleBuy = useCallback(async () => {
    haptics.medium();
    const pkg = packageForType(selectedType);
    if (!pkg) {
      // Offerings not loaded yet — shouldn't happen since button is
      // only enabled once offerings are available, but guard anyway.
      Alert.alert('Not available', 'Store not available right now. Please try again in a moment.');
      return;
    }
    const err = await purchasePackage(pkg);
    if (!err || err.code === 'cancelled') return;
    if (err.code === 'already_purchased') {
      // They already have it — just treat as success.
      return;
    }
    Alert.alert(
      'Purchase failed',
      err.message ?? 'Something went wrong. Please try again.',
      [{ text: 'OK' }],
    );
  }, [selectedType, purchasePackage, offerings]);

  const handleRestore = useCallback(async () => {
    haptics.light();
    const err = await restorePurchases();
    if (err) {
      Alert.alert(
        'Restore failed',
        err.message ?? 'Could not restore purchases. Please try again.',
        [{ text: 'OK' }],
      );
      return;
    }
    // restorePurchases succeeded. If isPro is now true the useEffect above
    // will close the sheet. If false, nothing was found — tell the user.
    if (!usePurchaseStore.getState().isPro) {
      Alert.alert(
        'No purchases found',
        'No previous Zonnie Pro purchase was found for this Apple ID.',
        [{ text: 'OK' }],
      );
    }
  }, [restorePurchases]);

  const handleClose = useCallback(() => {
    haptics.light();
    hide();
  }, [hide]);

  const renderBackdrop = useCallback(
    (props: Parameters<typeof BottomSheetBackdrop>[0]) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.45}
        pressBehavior="close"
        onPress={handleClose}
      />
    ),
    [handleClose],
  );

  const copy = triggerCopy(trigger);
  // Allow purchase attempt even if offerings haven't loaded yet —
  // the handleBuy function guards against null packages and shows
  // an alert. This prevents the button being permanently disabled
  // during sandbox testing before products are approved by Apple.
  const offersLoaded = true;

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={['92%']}
      enablePanDownToClose
      onClose={hide}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.background}
    >
      <BottomSheetScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Close button ── */}
        <Pressable
          onPress={handleClose}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          accessibilityLabel="Close"
          hitSlop={12}
        >
          <Text style={styles.closeButtonText}>✕</Text>
        </Pressable>

        {/* ── Hero ── */}
        <Text style={styles.heroEmoji}>{copy.emoji}</Text>
        <Text style={styles.heroTitle}>{copy.headline}</Text>
        <Text style={styles.heroSub}>{copy.sub}</Text>

        {/* ── Feature list ── */}
        <View style={styles.featureList}>
          {PRO_FEATURES.map((f) => (
            <View key={f.label} style={styles.featureRow}>
              <Text style={styles.featureEmoji}>{f.emoji}</Text>
              <Text style={styles.featureLabel}>{f.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Tier selector ── */}
        <View style={styles.tierRow}>

          {/* Monthly */}
          <Pressable
            onPress={() => { haptics.selection(); setSelectedType('monthly'); }}
            style={({ pressed }) => [
              styles.tierCard,
              selectedType === 'monthly' && styles.tierCardSelected,
              pressed && styles.pressed,
            ]}
            accessibilityLabel={`Monthly plan, ${priceStringForType('monthly')} per month`}
          >
            <Text style={styles.tierName}>Monthly</Text>
            <Text style={[styles.tierPrice, selectedType === 'monthly' && styles.tierPriceSelected]}>
              {priceStringForType('monthly')}
            </Text>
            <Text style={styles.tierPeriod}>per month</Text>
          </Pressable>

          {/* Yearly — highlighted */}
          <Pressable
            onPress={() => { haptics.selection(); setSelectedType('yearly'); }}
            style={({ pressed }) => [
              styles.tierCard,
              styles.tierCardYearly,
              selectedType === 'yearly' && styles.tierCardSelected,
              pressed && styles.pressed,
            ]}
            accessibilityLabel={`Yearly plan, ${priceStringForType('yearly')} per year, best value`}
          >
            <View style={styles.bestValueBadge}>
              <Text style={styles.bestValueText}>Best value</Text>
            </View>
            <Text style={styles.tierName}>Yearly</Text>
            <Text style={[styles.tierPrice, selectedType === 'yearly' && styles.tierPriceSelected]}>
              {priceStringForType('yearly')}
            </Text>
            <Text style={styles.tierPeriod}>per year</Text>
          </Pressable>

          {/* Lifetime */}
          <Pressable
            onPress={() => { haptics.selection(); setSelectedType('lifetime'); }}
            style={({ pressed }) => [
              styles.tierCard,
              selectedType === 'lifetime' && styles.tierCardSelected,
              pressed && styles.pressed,
            ]}
            accessibilityLabel={`Lifetime plan, ${priceStringForType('lifetime')} once`}
          >
            <Text style={styles.tierName}>Lifetime</Text>
            <Text style={[styles.tierPrice, selectedType === 'lifetime' && styles.tierPriceSelected]}>
              {priceStringForType('lifetime')}
            </Text>
            <Text style={styles.tierPeriod}>once</Text>
          </Pressable>

        </View>

        {/* ── Buy button ── */}
        <Pressable
          onPress={handleBuy}
          disabled={isLoading || !offersLoaded}
          style={({ pressed }) => [
            styles.buyButton,
            (isLoading || !offersLoaded) && styles.buyButtonDisabled,
            pressed && styles.pressed,
          ]}
          accessibilityLabel={`Continue with ${selectedType} plan`}
        >
          {isLoading ? (
            <ActivityIndicator color={palette.cream} />
          ) : (
            <Text style={styles.buyButtonText}>
              {selectedType === 'yearly'   ? `Start for ${priceStringForType('yearly')}/yr` :
               selectedType === 'monthly'  ? `Start for ${priceStringForType('monthly')}/mo` :
                                             `Buy lifetime — ${priceStringForType('lifetime')}`}
            </Text>
          )}
        </Pressable>

        {/* ── Legal / restore ── */}
        <Text style={styles.legal}>
          Subscriptions renew automatically. Cancel anytime in Settings.
          Payment charged to your Apple ID at confirmation.
        </Text>

        <Pressable
          onPress={handleRestore}
          disabled={isLoading}
          style={({ pressed }) => [styles.restoreButton, pressed && styles.pressed]}
          accessibilityLabel="Restore previous purchases"
        >
          <Text style={styles.restoreText}>Restore purchases</Text>
        </Pressable>

        {/* Bottom padding for home indicator */}
        <View style={styles.bottomSpacer} />
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  background: {
    backgroundColor: palette.sand,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  handle: {
    backgroundColor: palette.mistDeep,
    width: 36,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    alignItems: 'center',
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  closeButtonText: {
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    color: palette.inkSoft,
  },

  // Hero
  heroEmoji: {
    fontSize: 44,
    marginBottom: spacing.sm,
  },
  heroTitle: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.xxl,
    color: palette.ink,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  heroSub: {
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    color: palette.inkSoft,
    textAlign: 'center',
    lineHeight: fontSizes.md * 1.45,
    marginBottom: spacing.lg,
    maxWidth: 300,
  },

  // Feature list
  featureList: {
    alignSelf: 'stretch',
    backgroundColor: palette.sandDeep,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: spacing.sm,
  },
  featureEmoji: {
    fontSize: 16,
    width: 24,
    textAlign: 'center',
  },
  featureLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: palette.ink,
    flex: 1,
  },

  // Tier selector
  tierRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  tierCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: palette.sandDeep,
    borderWidth: 2,
    borderColor: 'transparent',
    minHeight: 96,
    justifyContent: 'center',
  },
  tierCardYearly: {
    // Slightly taller to accommodate the "Best value" badge above
    paddingTop: spacing.xs,
  },
  tierCardSelected: {
    borderColor: palette.burnt,
    backgroundColor: palette.cream,
  },
  tierName: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.xs,
    color: palette.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  tierPrice: {
    fontFamily: fonts.displayBold,
    fontSize: fontSizes.lg,
    color: palette.inkSoft,
  },
  tierPriceSelected: {
    color: palette.terracotta,
  },
  tierPeriod: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    color: palette.mistDeep,
    marginTop: 2,
  },
  bestValueBadge: {
    backgroundColor: palette.burnt,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginBottom: spacing.xs,
  },
  bestValueText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.xs,
    color: palette.cream,
  },

  // Buy button
  buyButton: {
    alignSelf: 'stretch',
    backgroundColor: palette.ink,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
    marginBottom: spacing.sm,
    minHeight: 50,
    justifyContent: 'center',
  },
  buyButtonDisabled: {
    backgroundColor: palette.mistDeep,
  },
  buyButtonText: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.md,
    color: palette.cream,
  },

  // Legal + restore
  legal: {
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    color: palette.mistDeep,
    textAlign: 'center',
    lineHeight: fontSizes.xs * 1.5,
    marginBottom: spacing.sm,
    maxWidth: 300,
  },
  restoreButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  restoreText: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: palette.inkSoft,
    textDecorationLine: 'underline',
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
  pressed: {
    opacity: 0.8,
  },
});
