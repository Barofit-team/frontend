import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DumbbellIcon, FlameIcon, StopwatchIcon } from './HomeIcons';

type Props = {
  count: number;
  minutes: number;
  calories: number | null;
  compact?: boolean;
};

export function RoutineMetrics({
  count,
  minutes,
  calories,
  compact = false,
}: Props) {
  const items = [
    { label: `${count}종목`, Icon: DumbbellIcon },
    { label: `약 ${minutes}분`, Icon: StopwatchIcon },
    ...(calories == null
      ? []
      : [{ label: `약 ${calories} kcal`, Icon: FlameIcon }]),
  ];
  return (
    <View
      style={[styles.row, !compact && styles.box]}
      accessibilityLabel={items.map((x) => x.label).join(', ')}
    >
      {items.map(({ label, Icon }, i) => (
        <React.Fragment key={label}>
          {i > 0 && <View style={styles.divider} />}
          <View style={styles.item}>
            {!compact && <Icon size={15} color="#A0A0A0" />}
            <Text style={[styles.text, compact && styles.compactText]}>
              {label}
            </Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  box: {
    backgroundColor: '#F8F8F8',
    borderWidth: 1,
    borderColor: '#EFEFEF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 11,
    justifyContent: 'center',
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  divider: { height: 15, width: 1, backgroundColor: '#E5E5E5' },
  text: { fontSize: 12, fontWeight: '500', color: '#777777' },
  compactText: { fontSize: 12, color: '#888888' },
});
