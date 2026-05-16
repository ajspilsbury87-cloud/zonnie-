import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorBoundary } from '@/src/components/ErrorBoundary';
import { MainSheet } from '@/src/components/MainSheet';
import { ProPaywall } from '@/src/components/ProPaywall';
import { TerraceDetailSheet } from '@/src/components/TerraceDetailSheet';
import { ZonnieMap } from '@/src/components/ZonnieMap';
import type { ScoredTerrace } from '@/src/hooks/useScoredTerraces';
import { useSelectionStore } from '@/src/store/selectionStore';

export default function Index() {
  const select = useSelectionStore((s) => s.select);
  const handleSelect = useCallback(
    (item: ScoredTerrace) => select(item.terrace.id),
    [select],
  );

  // Each top-level surface gets its own boundary so a crash in one (e.g.
  // map render) doesn't take the bottom sheet down with it. The visible
  // fallback also gives us a way to read the error message — without this,
  // a thrown render error would unmount the tree and the user would see a
  // blank screen / iOS would eventually kill the process.
  return (
    <View style={styles.container}>
      <ErrorBoundary surface="ZonnieMap">
        <ZonnieMap onSelect={handleSelect} />
      </ErrorBoundary>
      <ErrorBoundary surface="MainSheet">
        <MainSheet onSelect={handleSelect} />
      </ErrorBoundary>
      <ErrorBoundary surface="TerraceDetailSheet">
        <TerraceDetailSheet />
      </ErrorBoundary>
      <ErrorBoundary surface="ProPaywall">
        <ProPaywall />
      </ErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
