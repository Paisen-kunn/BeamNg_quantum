import React from 'react';
import { StyleSheet, View, ImageBackground, Dimensions, ScrollView } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import mapData from '@/assets/map_data.json';
import Svg, { Polyline, Circle } from 'react-native-svg';

const preview = require('@/assets/map_preview.png');

export default function MapScreen() {
  const { width } = Dimensions.get('window');
  const aspect = 1; // preview is square
  const imgWidth = width;
  const imgHeight = width * aspect;

  return (
    <ThemedView style={styles.container}>
      <ScrollView maximumZoomScale={4} minimumZoomScale={1} contentContainerStyle={{ flex: 1 }}>
        <ImageBackground source={preview} style={{ width: imgWidth, height: imgHeight }}>
          <View style={{ width: imgWidth, height: imgHeight }}>
            <Svg width={imgWidth} height={imgHeight} style={StyleSheet.absoluteFill}>
              {mapData.polylines &&
                mapData.polylines.map((pl, idx) => {
                  const pts = pl.points.map(p => `${p.nx * imgWidth},${p.ny * imgHeight}`).join(' ');
                  return <Polyline key={idx} points={pts} fill="none" stroke="rgba(0,120,200,0.9)" strokeWidth={3} />;
                })}
              {mapData.points &&
                mapData.points.slice(0, 1000).map((p, i) => (
                  <Circle key={i} cx={p.nx * imgWidth} cy={p.ny * imgHeight} r={4} fill="rgba(255,0,0,0.9)" />
                ))}
            </Svg>
          </View>
        </ImageBackground>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
