import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MonthlyWorkoutStatusMap, WorkoutDayStatus } from '@/types/workoutRecord';

import { buildMonthGrid, toDateKey, WEEKDAY_LABELS, type YearMonth } from './calendar';
import { RecordColors } from './palette';
import { DAY_STATUS_LABEL } from './status';

interface MonthlyCalendarProps {
  yearMonth: YearMonth;
  statuses: MonthlyWorkoutStatusMap;
  selectedDate: string;
  /** 'YYYY-MM-DD' — 이후 날짜는 흐린 글자로 표시 */
  todayKey: string;
  onSelectDate: (dateKey: string) => void;
}

const DAY_SIZE = 26;

function dayCircleStyle(status: WorkoutDayStatus | undefined, selected: boolean) {
  if (selected) return styles.selected;
  switch (status) {
    case 'completed':
      return styles.completed;
    case 'partial':
      return styles.partial;
    case 'missed':
      return styles.missed;
    case 'planned':
      return styles.planned;
    default:
      return null;
  }
}

function dayTextStyle(status: WorkoutDayStatus | undefined, selected: boolean, isFuture: boolean) {
  if (selected || status === 'completed' || status === 'partial') return styles.dayTextOnFill;
  if (status === 'missed') return styles.dayTextMissed;
  if (status === 'planned') return styles.dayTextPlanned;
  return isFuture ? styles.dayTextFuture : null;
}

export const MonthlyCalendar = memo(function MonthlyCalendar({
  yearMonth,
  statuses,
  selectedDate,
  todayKey,
  onSelectDate,
}: MonthlyCalendarProps) {
  const weeks = buildMonthGrid(yearMonth);

  return (
    <View>
      <View style={styles.row}>
        {WEEKDAY_LABELS.map((label) => (
          <View key={label} style={styles.cell}>
            <Text style={styles.weekday}>{label}</Text>
          </View>
        ))}
      </View>

      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} style={styles.row}>
          {week.map((day, dayIndex) => {
            if (day === null) return <View key={`empty-${dayIndex}`} style={styles.cell} />;

            const dateKey = toDateKey(yearMonth, day);
            const status = statuses[dateKey];
            const selected = dateKey === selectedDate;
            const isFuture = dateKey > todayKey;

            return (
              <View key={dateKey} style={styles.cell}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${yearMonth.month}월 ${day}일${status ? `, ${DAY_STATUS_LABEL[status]}` : ''}`}
                  accessibilityState={{ selected }}
                  hitSlop={6}
                  onPress={() => onSelectDate(dateKey)}
                  style={({ pressed }) => [
                    styles.day,
                    dayCircleStyle(status, selected),
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.dayText, dayTextStyle(status, selected, isFuture)]}>{day}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 36 },
  weekday: { fontSize: 11, fontWeight: '600', color: RecordColors.text },
  day: {
    width: DAY_SIZE,
    height: DAY_SIZE,
    borderRadius: DAY_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { backgroundColor: RecordColors.selected },
  completed: { backgroundColor: RecordColors.completed },
  partial: { backgroundColor: RecordColors.partial },
  missed: { backgroundColor: RecordColors.missed },
  planned: { borderWidth: 1, borderColor: RecordColors.plannedBorder },
  pressed: { opacity: 0.6 },
  dayText: { fontSize: 11, fontWeight: '500', color: RecordColors.dayText },
  dayTextOnFill: { color: RecordColors.white, fontWeight: '700' },
  dayTextMissed: { color: RecordColors.missedText },
  dayTextPlanned: { color: RecordColors.textSecondary },
  dayTextFuture: { color: RecordColors.dayTextFuture },
});
