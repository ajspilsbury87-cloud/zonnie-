import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { MainSheet } from '@/src/components/MainSheet';
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

  return (
    <View style={styles.container}>
      <ZonnieMap onSelect={handleSelect} />
      <MainSheet onSelect={handleSelect} />
      <TerraceDetailSheet />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
