/**
 * 월간 운동기록
 *
 * 진입: 마이페이지(나 탭) → 월간 운동기록 (현재는 [DEV] 버튼으로 연결, 마이페이지 확정 전)
 *  - 뒤로가기 → 마이페이지
 *  - 이전/다음 달, 연도·월 선택(휠) → 해당 월 상태 갱신, 선택 날짜는 오늘(그 달이면) 또는 1일
 *  - 날짜 선택 → 일일 운동일지 목록 초기화 + 맨 위로 이동 후 첫 4개 표시
 *  - 목록 하단 도달 → 4개씩 추가, 마지막 기록 이후에는 더 불러오지 않음
 *
 * 데이터: services/workoutRecordService.ts ([Mock] mocks/workoutRecords.ts — API 연동 시 서비스만 교체)
 * 리포트 상세 화면은 이번 범위 밖입니다 (리포트 보기 → 준비 중 안내).
 *
 * 개발용 진입: barofit://monthly-workout-records
 */
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArrowLeftIcon, ChevronRightIcon } from '@/components/home/HomeIcons';
import {
  addMonths,
  buildMonthOptions,
  defaultSelectedDateOf,
  formatYearMonth,
  yearMonthOf,
  type YearMonth,
} from '@/components/workout-records/calendar';
import { DailyRecordCard } from '@/components/workout-records/DailyRecordCard';
import { MonthlyCalendar } from '@/components/workout-records/MonthlyCalendar';
import { MonthPickerModal } from '@/components/workout-records/MonthPickerModal';
import { RecordColors } from '@/components/workout-records/palette';
import { useDailyWorkoutRecords } from '@/hooks/useDailyWorkoutRecords';
import { useMonthlyWorkoutStatus } from '@/hooks/useMonthlyWorkoutStatus';
import { toIsoDateString } from '@/services/weeklyPlanService';
import { DAILY_RECORD_PAGE_SIZE } from '@/services/workoutRecordService';
import type { DailyWorkoutRecord } from '@/types/workoutRecord';

export default function MonthlyWorkoutRecordsScreen() {
  const insets = useSafeAreaInsets();
  const [today] = useState(() => new Date());
  const todayKey = toIsoDateString(today);

  const [yearMonth, setYearMonth] = useState<YearMonth>(() => yearMonthOf(today));
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [pickerVisible, setPickerVisible] = useState(false);
  const listRef = useRef<FlatList<DailyWorkoutRecord>>(null);

  const { statuses } = useMonthlyWorkoutStatus(yearMonth);
  const { records, hasNext, isLoading, error, loadMore, retry } = useDailyWorkoutRecords(selectedDate);
  const monthOptions = useMemo(() => buildMonthOptions(yearMonth), [yearMonth]);

  // 날짜가 바뀌면 목록을 맨 위로
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [selectedDate]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/profile');
  };

  const changeMonth = useCallback(
    (next: YearMonth) => {
      setYearMonth(next);
      setSelectedDate(defaultSelectedDateOf(next, today));
    },
    [today]
  );

  const handlePressReport = useCallback(() => {
    // TODO: 리포트 상세 화면이 생기면 연결
    Alert.alert('리포트 보기', '리포트 화면은 준비 중이에요.');
  }, []);

  const renderItem: ListRenderItem<DailyWorkoutRecord> = useCallback(
    ({ item }) => (
      <View style={styles.itemWrap}>
        <DailyRecordCard record={item} onPressReport={handlePressReport} />
      </View>
    ),
    [handlePressReport]
  );

  const header = (
    <>
      <View style={styles.calendarSection}>
        <View style={styles.monthRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="이전 달"
            hitSlop={8}
            onPress={() => changeMonth(addMonths(yearMonth, -1))}
            style={({ pressed }) => [styles.monthArrow, pressed && styles.pressed]}>
            <View style={styles.flip}>
              <ChevronRightIcon color={RecordColors.text} size={10} />
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${formatYearMonth(yearMonth)}, 연도와 월 선택`}
            hitSlop={8}
            onPress={() => setPickerVisible(true)}
            style={({ pressed }) => pressed && styles.pressed}>
            <Text style={styles.monthLabel}>{formatYearMonth(yearMonth)}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="다음 달"
            hitSlop={8}
            onPress={() => changeMonth(addMonths(yearMonth, 1))}
            style={({ pressed }) => [styles.monthArrow, pressed && styles.pressed]}>
            <ChevronRightIcon color={RecordColors.text} size={10} />
          </Pressable>
        </View>

        <MonthlyCalendar
          yearMonth={yearMonth}
          statuses={statuses}
          selectedDate={selectedDate}
          todayKey={todayKey}
          onSelectDate={setSelectedDate}
        />
      </View>

      <Text style={styles.sectionTitle} accessibilityRole="header">
        일일 운동일지
      </Text>
    </>
  );

  const empty =
    isLoading && records.length === 0 ? (
      <ActivityIndicator style={styles.loading} color={RecordColors.textSecondary} />
    ) : error ? (
      <View style={[styles.itemWrap, styles.emptyCard]}>
        <Text style={styles.emptyText}>{error}</Text>
        <Pressable accessibilityRole="button" onPress={retry} hitSlop={8}>
          <Text style={styles.retryText}>다시 시도</Text>
        </Pressable>
      </View>
    ) : (
      <View style={[styles.itemWrap, styles.emptyCard]}>
        <Text style={styles.emptyText}>이 날의 운동기록이 없어요</Text>
      </View>
    );

  const footer =
    records.length === 0 ? undefined : isLoading ? (
      <ActivityIndicator style={styles.loading} color={RecordColors.textSecondary} />
    ) : error ? (
      <Pressable accessibilityRole="button" onPress={retry} hitSlop={8} style={styles.footer}>
        <Text style={styles.retryText}>{error} 다시 시도</Text>
      </Pressable>
    ) : !hasNext && records.length > DAILY_RECORD_PAGE_SIZE ? (
      <Text style={[styles.footer, styles.footerText]}>마지막 기록이에요</Text>
    ) : undefined;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로 가기"
          hitSlop={10}
          onPress={handleBack}
          style={({ pressed }) => pressed && styles.pressed}>
          <ArrowLeftIcon color={RecordColors.text} size={18} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          월간 운동기록
        </Text>
      </View>

      <FlatList
        ref={listRef}
        style={styles.list}
        data={records}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        ItemSeparatorComponent={Separator}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      />

      <MonthPickerModal
        visible={pickerVisible}
        value={yearMonth}
        options={monthOptions}
        onClose={() => setPickerVisible(false)}
        onConfirm={(next) => {
          setPickerVisible(false);
          changeMonth(next);
        }}
      />
    </SafeAreaView>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const SCREEN_PADDING = 16;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: RecordColors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: SCREEN_PADDING,
    height: 48,
  },
  title: { fontSize: 14, fontWeight: '600', color: RecordColors.text },
  list: { flex: 1, backgroundColor: RecordColors.section },
  listContent: { flexGrow: 1, backgroundColor: RecordColors.section },
  calendarSection: {
    backgroundColor: RecordColors.background,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 4,
    paddingBottom: 14,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    marginBottom: 14,
  },
  monthArrow: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: RecordColors.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flip: { transform: [{ rotate: '180deg' }] },
  monthLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: RecordColors.text,
    textDecorationLine: 'underline',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: RecordColors.text,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 18,
    paddingBottom: 12,
  },
  itemWrap: { marginHorizontal: SCREEN_PADDING },
  separator: { height: 14 },
  emptyCard: {
    backgroundColor: RecordColors.card,
    borderRadius: 12,
    paddingVertical: 28,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: { fontSize: 13, color: RecordColors.textSecondary },
  retryText: { fontSize: 13, fontWeight: '600', color: RecordColors.text, textDecorationLine: 'underline' },
  loading: { marginVertical: 20 },
  footer: { marginTop: 16, alignSelf: 'center' },
  footerText: { fontSize: 12, color: RecordColors.textSecondary },
  pressed: { opacity: 0.6 },
});
