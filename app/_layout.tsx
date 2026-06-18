import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  Fraunces_500Medium,
  Fraunces_500Medium_Italic,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { useCallback, useEffect, useState } from 'react';
import * as Updates from 'expo-updates';

import { NotificationPrompt } from '@/src/components/NotificationPrompt';
import { useLandingStore } from '@/src/store/landingStore';
import { shouldShowPrompt } from '@/src/notifications/permission';
import { useDailyForecastNotification } from '@/src/notifications/useDailyForecastNotification';
import { useFavouritesSunnyNotifications } from '@/src/notifications/useFavouritesSunnyNotifications';
import { useFeaturedTerraceNotification } from '@/src/notifications/useFeaturedTerraceNotification';
import { useContextualNotifications } from '@/src/notifications/useContextualNotifications';
import { OnboardingIntro } from '@/src/onboarding/OnboardingIntro';
import { shouldShowIntro } from '@/src/onboarding/state';
import { useFavoritesStore } from '@/src/store/favoritesStore';
import { usePurchaseStore } from '@/src/store/purchaseStore';
import { useWeatherRefresh } from '@/src/hooks/useWeatherRefresh';
import { useWidgetSync } from '@/src/widget/useWidgetSync';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_500Medium,
    Fraunces_500Medium_Italic,
    Fraunces_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const hydrateFavorites = useFavoritesStore((s) => s.hydrate);
  useEffect(() => {
    void hydrateFavorites();
  }, [hydrateFavorites]);

  // Configure RevenueCat and hydrate Pro entitlement status.
  // Must run before any gated component renders so isPro is correct
  // on first paint — preventing a flash of locked UI for paying users.
  const configurePurchases = usePurchaseStore((s) => s.configure);
  useEffect(() => {
    void configurePurchases();
  }, [configurePurchases]);

  // Aggressively check for OTA updates on every launch and reload
  // immediately if one is available — no waiting for next cold start.
  useEffect(() => {
    if (!Updates.isEnabled) return;
    void (async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (_) {
        // Network offline or server error — silent fail, use cached bundle
      }
    })();
  }, []);

  // Keep the iOS home-screen widget's snapshot in sync with the live
  // top-3. iOS-only inside the hook; cheap no-op on Android.
  useWidgetSync();

  // Keep live weather data fresh: invalidates today's forecast on
  // foreground resume and re-fetches on a 30-minute interval.
  useWeatherRefresh();

  // Daily "sunny tomorrow" notification scheduler — re-syncs whenever
  // tomorrow's weather data lands or changes. No-op until the user
  // grants notification permission via the prompt below.
  useDailyForecastNotification();

  // Per-favourite terrace notifications — schedules one notification
  // per favourited terrace that has a 2+ hour sunny block tomorrow.
  // Re-syncs whenever favourites or tomorrow's weather changes.
  useFavouritesSunnyNotifications();

  // Monthly "featured terrace of the month" notification — fires on the
  // 1st of next month at 10:00. Synced once per app open.
  useFeaturedTerraceNotification();

  // Contextual notifications: week-ahead (Mon 08:00), weekday evening
  // alert (Mon–Fri 16:00), and weekend day-of alert (Sat–Sun 09:00).
  // Re-syncs whenever any of the next 7 days of weather data changes.
  useContextualNotifications();

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // First-run onboarding intro — 2-slide carousel that establishes
  // the app's purpose and primary gesture before the user sees the
  // live UI. Shown only on the first launch (persisted via
  // `onboarding:intro-v1` in AsyncStorage). Sits ABOVE the landing
  // page; dismissing the intro reveals the landing page underneath.
  // Initial state `null` = "haven't checked yet" — we don't want to
  // flash a "no intro" frame before the AsyncStorage read resolves.
  const [showIntro, setShowIntro] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const should = await shouldShowIntro();
      if (!cancelled) setShowIntro(should);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const handleIntroDismiss = useCallback(() => setShowIntro(false), []);

  // Landing overlay is now controlled by useLandingStore — see app/index.tsx
  // for where <LandingPage /> is rendered (above MainSheet, below detail sheet).
  // We still read visible here to defer the notification prompt until Home is
  // dismissed — showing both at once would be jarring.
  const landingVisible = useLandingStore((s) => s.visible);

  // Notification permission explainer — shown once on the first
  // launch where permission is undetermined. Self-marks as prompted
  // either way, so users never see it twice. Deferred until the
  // landing page has dismissed (showing both at once is jarring).
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  useEffect(() => {
    let cancelled = false;
    // When Home re-opens, dismiss any orphaned prompt immediately so it
    // can never be stranded behind the Home overlay.
    if (landingVisible) { setShowNotifPrompt(false); return; }
    void (async () => {
      const should = await shouldShowPrompt();
      if (!cancelled && should) setShowNotifPrompt(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [landingVisible]);
  const handleNotifPromptDismiss = useCallback(
    () => setShowNotifPrompt(false),
    [],
  );

  if (!fontsLoaded && !fontError) {
    return null;
  }

  // BottomSheetModalProvider was originally HERE (wrapping the entire
  // Stack). After Andy's TEST DETAIL diagnostic showed the modal silently
  // failing to present, suspected cause: expo-router's <Stack> creates a
  // navigator boundary that breaks the Gorhom v5 modal portal's host
  // discovery. Provider moved into app/index.tsx so it sits directly
  // above the consumer (TerraceDetailSheet) without any navigator
  // boundary in between.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
        {showIntro ? (
          <OnboardingIntro onDismiss={handleIntroDismiss} />
        ) : null}
        {showNotifPrompt ? (
          <NotificationPrompt onDismiss={handleNotifPromptDismiss} />
        ) : null}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
