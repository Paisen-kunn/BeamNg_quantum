import React from 'react';
import { StyleSheet, View, ImageBackground, Dimensions, ScrollView } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import mapData from '@/assets/map_data.json';

const preview = require('@/assets/map_preview.png');

export default function MapScreen() {
  const { width } = Dimensions.get('window');
  const aspect = 1; // map preview is square (2048x2048)
  const imgWidth = width;
  const imgHeight = width * aspect;

  return (
    <ThemedView style={styles.container}>
      <ScrollView maximumZoomScale={3} minimumZoomScale={1} contentContainerStyle={{ flex: 1 }}>
        <ImageBackground source={preview} style={{ width: imgWidth, height: imgHeight }}>
          <View style={{ width: imgWidth, height: imgHeight }}>
            {mapData.points.slice(0, 500).map((p, i) => {
              const left = p.nx * imgWidth - 6;
              const top = p.ny * imgHeight - 6;
              return <View key={i} style={[styles.marker, { left, top }]} />;
            })}
          </View>
        </ImageBackground>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  marker: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,0,0,0.9)',
    borderWidth: 1,
    borderColor: '#fff',
  },
});
