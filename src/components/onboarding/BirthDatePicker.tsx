import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const ROW_HEIGHT = 54;

function Wheel({ label, values, value, onChange }: {
  label: string; values: number[]; value: number; onChange: (value: number) => void;
}) {
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const index = Math.max(0, values.indexOf(value));
  const latest = useRef({ values, onChange });
  latest.current = { values, onChange };
  useEffect(() => {
    scroll.current?.scrollTo({ y: index * ROW_HEIGHT, animated: false });
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [index, values.length]);
  return (
    <View style={styles.column}>
      <ScrollView ref={scroll} style={styles.scroll} nestedScrollEnabled
        showsVerticalScrollIndicator={false} snapToInterval={ROW_HEIGHT}
        decelerationRate="fast" contentContainerStyle={styles.items}
        onScroll={(event) => {
          const offset = event.nativeEvent.contentOffset.y;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            const current = latest.current;
            const next = Math.max(0, Math.min(current.values.length - 1, Math.round(offset / ROW_HEIGHT)));
            current.onChange(current.values[next]);
            scroll.current?.scrollTo({ y: next * ROW_HEIGHT, animated: false });
          }, 120);
        }} scrollEventThrottle={16}>
        {values.map((item) => (
          <Pressable key={item} accessibilityRole="button"
            accessibilityLabel={`${label} ${item}`} accessibilityState={{ selected: item === value }}
            aria-selected={item === value} onPress={() => onChange(item)} style={styles.item}>
            <Text style={[styles.text, item === value && styles.selected]}>
              {String(item).padStart(2, '0')}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export function BirthDatePicker({ year, month, day, onChange }: {
  year: number; month: number; day: number;
  onChange: (year: number, month: number, day: number) => void;
}) {
  const currentYear = new Date().getFullYear();
  const days = new Date(year, month, 0).getDate();
  const choose = (y: number, m: number, d: number) => onChange(y, m, Math.min(d, new Date(y, m, 0).getDate()));
  return (
    <View style={styles.picker}>
      <View pointerEvents="none" style={styles.highlight} />
      <Wheel label="연도" values={Array.from({ length: 87 }, (_, i) => currentYear - 100 + i)}
        value={year} onChange={(y) => choose(y, month, day)} />
      <Wheel label="월" values={Array.from({ length: 12 }, (_, i) => i + 1)}
        value={month} onChange={(m) => choose(year, m, day)} />
      <Wheel label="일" values={Array.from({ length: days }, (_, i) => i + 1)}
        value={day} onChange={(d) => choose(year, month, d)} />
    </View>
  );
}

const styles = StyleSheet.create({
  picker: { marginTop: 52, height: ROW_HEIGHT * 3, flexDirection: 'row' },
  highlight: { position: 'absolute', top: ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT, backgroundColor: '#F2F2F2', borderRadius: 8 },
  column: { flex: 1, overflow: 'hidden' },
  scroll: { height: ROW_HEIGHT * 3 },
  items: { paddingVertical: ROW_HEIGHT },
  item: { height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 21, lineHeight: 28, fontWeight: '600', color: '#BBBBBB' },
  selected: { color: '#222222' },
});
