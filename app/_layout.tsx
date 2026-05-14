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

import { LandingPage } from '@/src/components/LandingPage';
import { NotificationPrompt } from '@/src/components/NotificationPrompt';
import { shouldShowPrompt } from '@/src/notifications/permission';
import { useDailyForecastNotification } from '@/src/notifications/useDailyForecastNotification';
import { OnboardingIntro } from '@/src/onboarding/OnboardingIntro';
import { shouldShowIntro } from '@/src/onboarding/state';
import { useFavoritesStore } from '@/src/store/favoritesStore';
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

  // Keep the iOS home-screen widget's snapshot in sync with the live
  // top-3. iOS-only inside the hook; cheap no-op on Android.
  useWidgetSync();

  // Daily "sunny tomorrow" notification scheduler — re-syncs whenever
  // tomorrow's weather data lands or changes. No-op until the user
  // grants notification permission via the prompt below.
  useDailyForecastNotification();

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

  // Branded landing page — sits above the app surface on launch with
  // the brand sun-and-rays moment + top 3 sunny terraces "right now"
  // as cards. User taps "See all terraces" to enter the live map.
  // Native splash hides as soon as fonts load; the landing background
  // is `palette.sand` to match for a seamless handover.
  const [showLanding, setShowLanding] = useState(true);
  const handleLandingContinue = useCallback(() => setShowLanding(false), []);

  // Notification permission explainer — shown once on the first
  // launch where permission is undetermined. Self-marks as prompted
  // either way, so users never see it twice. Deferred until the
  // landing page has dismissed (showing both at once is jarring).
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (showLanding) return;
    void (async () => {
      const should = await shouldShowPrompt();
      if (!cancelled && should) setShowNotifPrompt(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [showLanding]);
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
        {showLanding ? (
          <LandingPage onContinue={handleLandingContinue} />
        ) : null}
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
