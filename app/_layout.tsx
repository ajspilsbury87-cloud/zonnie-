import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
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

import { SplashOverlay } from '@/src/components/SplashOverlay';
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

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Branded splash overlay — sits above the app surface for ~1.6s after
  // fonts load. Hands off to the live map+list once its fade-out
  // completes. The native splash hides as soon as fonts are ready;
  // because both screens use `palette.sand` as the background and our
  // overlay mounts in the same frame, the handover is seamless.
  const [showSplashOverlay, setShowSplashOverlay] = useState(true);
  const handleSplashDone = useCallback(() => setShowSplashOverlay(false), []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <BottomSheetModalProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }} />
          {showSplashOverlay ? (
            <SplashOverlay onAnimationDone={handleSplashDone} />
          ) : null}
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
