import React, { useState } from 'react';
import { StyleSheet, View, Dimensions, Pressable, Text } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import mapData from '@/assets/map_data.json';
import Svg, { Polyline, Line } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

const AnimatedView = Animated.createAnimatedComponent(View);

export default function MapScreen() {
  const { width } = Dimensions.get('window');

  // compute aspect from bounds when available to preserve level proportions
  const bounds = (mapData && mapData.bounds) || null;
  const aspect = bounds
    ? Math.max(0.1, (bounds.maxy - bounds.miny) / Math.max(1e-6, bounds.maxx - bounds.minx))
    : 1;

  const imgWidth = width;
  const imgHeight = Math.max(300, Math.round(width * aspect));

  // gesture / animation state
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);

  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      // noop
    })
    .onUpdate((e) => {
      scale.value = Math.max(0.2, Math.min(8, scale.value * e.scale));
    })
    .onEnd(() => {
      scale.value = withTiming(Math.max(0.5, Math.min(6, scale.value)), { duration: 200 });
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value += e.changeX;
      translateY.value += e.changeY;
    })
    .onEnd(() => {
      translateX.value = withTiming(translateX.value, { duration: 200 });
      translateY.value = withTiming(translateY.value, { duration: 200 });
    });

  const composed = Gesture.Simultaneous(pan, pinch);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });

  // tile-like grid: draw lines every quarter width/height (visual aid for zoom)
  const tileCols = 4;
  const tileRows = Math.max(1, Math.round(tileCols * aspect));

  return (
    <ThemedView style={styles.container}>
      <GestureDetector gesture={composed}>
        <AnimatedView style={[styles.mapCanvas, { width: imgWidth, height: imgHeight }, animatedStyle]}>
          <Svg width={imgWidth} height={imgHeight}>
            {/* grid */}
            {Array.from({ length: tileCols + 1 }).map((_, i) => (
              <Line
                key={`v-${i}`}
                x1={(i * imgWidth) / tileCols}
                y1={0}
                x2={(i * imgWidth) / tileCols}
                y2={imgHeight}
                stroke="#e0e0e0"
                strokeWidth={1}
              />
            ))}
            {Array.from({ length: tileRows + 1 }).map((_, i) => (
              <Line
                key={`h-${i}`}
                x1={0}
                y1={(i * imgHeight) / tileRows}
                x2={imgWidth}
                y2={(i * imgHeight) / tileRows}
                stroke="#e0e0e0"
                strokeWidth={1}
              />
            ))}

            {/* polylines (vector track) */}
            {mapData.polylines &&
              mapData.polylines.map((pl, idx) => {
                const pts = pl.points.map((p) => `${p.nx * imgWidth},${p.ny * imgHeight}`).join(' ');
                return (
                  <Polyline
                    key={idx}
                    points={pts}
                    fill="none"
                    stroke="#1e40af"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })}
          </Svg>

          {/* interactive markers (small, subtle) */}
          {mapData.points &&
            mapData.points.slice(0, 200).map((p, i) => {
              const left = p.nx * imgWidth - 8;
              const top = p.ny * imgHeight - 8;
              return (
                <Pressable
                  key={i}
                  onPress={() => setSelectedPoint(i)}
                  style={[styles.marker, { left, top }]}
                  accessibilityLabel={`point-${i}`}
                />
              );
            })}

          {/* simple info popup */}
          {selectedPoint !== null && mapData.points && mapData.points[selectedPoint] && (
            <View style={styles.popup}>
              <Text style={styles.popupTitle}>Point {selectedPoint}</Text>
              <Text style={styles.popupText} numberOfLines={2}>
                {`x: ${mapData.points[selectedPoint].x?.toFixed?.(2) ?? 'N/A'}`}
              </Text>
              <Text style={styles.popupText} numberOfLines={2}>
                {`y: ${mapData.points[selectedPoint].y?.toFixed?.(2) ?? 'N/A'}`}
              </Text>
              <Pressable onPress={() => setSelectedPoint(null)} style={styles.popupClose}>
                <Text style={{ color: '#fff' }}>Close</Text>
              </Pressable>
            </View>
          )}
        </AnimatedView>
      </GestureDetector>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  mapCanvas: { backgroundColor: '#f8fafc', overflow: 'hidden' },
  marker: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(16,185,129,0.95)',
    borderWidth: 1,
    borderColor: '#fff',
  },
  popup: {
    position: 'absolute',
    right: 12,
    top: 12,
    backgroundColor: '#0f172a',
    padding: 8,
    borderRadius: 8,
    width: 160,
  },
  popupTitle: { color: '#fff', fontWeight: '600', marginBottom: 4 },
  popupText: { color: '#cbd5e1', fontSize: 12 },
  popupClose: {
    marginTop: 8,
    backgroundColor: '#ef4444',
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: 'center',
  },
});
