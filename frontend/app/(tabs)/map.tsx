import React from 'react';
import { StyleSheet, View, Dimensions, ScrollView } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import mapData from '@/assets/map_data.json';
import Svg, { Polyline } from 'react-native-svg';

export default function MapScreen() {
  const { width } = Dimensions.get('window');

  // compute aspect from bounds when available to preserve level proportions
  const bounds = (mapData && mapData.bounds) || null;
  const aspect = bounds
    ? Math.max(0.1, (bounds.maxy - bounds.miny) / Math.max(1e-6, bounds.maxx - bounds.minx))
    : 1;

  const imgWidth = width;
  const imgHeight = Math.max(300, Math.round(width * aspect));

  return (
    <ThemedView style={styles.container}>
      <ScrollView maximumZoomScale={6} minimumZoomScale={1} contentContainerStyle={{ flex: 1 }}>
        <View style={[styles.mapCanvas, { width: imgWidth, height: imgHeight }]}>
          <Svg width={imgWidth} height={imgHeight} style={StyleSheet.absoluteFill}>
            {mapData.polylines &&
              mapData.polylines.map((pl, idx) => {
                const pts = pl.points.map((p) => `${p.nx * imgWidth},${p.ny * imgHeight}`).join(' ');
                return (
                  <Polyline
                    key={idx}
                    points={pts}
                    fill="none"
                    stroke="#2b6cb0"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })}
          </Svg>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  mapCanvas: { backgroundColor: '#f2f2f2' },
});
