import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  ArrowLeftIcon,
  MinusIcon,
  PlusIcon,
} from '@/components/home/HomeIcons';
import {
  useTodayRoutineStore,
  type TodayRoutineSession,
} from '@/stores/useTodayRoutineStore';

const MIN_SETS = 1;
const MAX_SETS = 15;
const MIN_REPS = 1;
const MAX_REPS = 100;

export default function TodayRoutineScreen() {
  const insets = useSafeAreaInsets();

  const routineTitle = useTodayRoutineStore((state) => state.routineTitle);
  const tags = useTodayRoutineStore((state) => state.tags);
  const interExerciseRestSeconds = useTodayRoutineStore(
    (state) => state.interExerciseRestSeconds,
  );
  const sessions = useTodayRoutineStore((state) => state.sessions);
  const updateSession = useTodayRoutineStore((state) => state.updateSession);

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [draftSets, setDraftSets] = useState<number>(3);
  const [draftReps, setDraftReps] = useState<number>(20);

  const editingSession =
    sessions.find((item) => item.id === editingSessionId) ?? null;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/home');
  };

  const handleOpenSessionSheet = (session: TodayRoutineSession) => {
    setEditingSessionId(session.id);
    setDraftSets(session.sets);
    setDraftReps(session.reps);
  };

  const handleCloseSessionSheet = () => {
    setEditingSessionId(null);
  };

  const handleSaveSession = () => {
    if (!editingSession) return;
    updateSession(editingSession.id, {
      sets: draftSets,
      reps: draftReps,
    });
    setEditingSessionId(null);
  };

  const handleRevertSession = () => {
    if (!editingSession) return;
    setDraftSets(editingSession.defaultSets);
    setDraftReps(editingSession.defaultReps);
  };

  const handleStartWorkout = () => {
    router.push('/workout-preparation', { dangerouslySingular: true });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />

      {/* 상단 네비게이션 바 (뒤로가기) */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로 가기"
          hitSlop={8}
          onPress={handleBack}
          style={({ pressed }) => [
            styles.circleButton,
            pressed && styles.pressed,
          ]}>
          <ArrowLeftIcon color="#111111" size={18} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 92 },
        ]}
        showsVerticalScrollIndicator={false}>
        {/* 상단 루틴 제목 및 태그 */}
        <View style={styles.titleSection}>
          <Text style={styles.pageTitle}>오늘의 운동 루틴</Text>
          <Text style={styles.routineSubtitle}>{routineTitle}</Text>

          <View style={styles.tagRow}>
            {tags.map((tag) => (
              <View key={tag} style={styles.tagChip}>
                <Text style={styles.tagChipText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 운동 세션 및 휴식 타임라인 리스트 */}
        <View style={styles.sessionList}>
          {sessions.map((session, index) => (
            <React.Fragment key={session.id}>
              {/* 운동 종목 카드 */}
              <View style={styles.exerciseCard}>
                <Text style={styles.exerciseTitle}>{session.name}</Text>

                <View style={styles.exerciseMetaGroup}>
                  <Text style={styles.exerciseVolumeText}>
                    {`${session.reps}회 × ${session.sets}세트`}
                  </Text>
                  <Text style={styles.exerciseRestText}>
                    {`세트 간 ${session.restSeconds}초 휴식`}
                  </Text>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${session.name} 세트·횟수 조절`}
                  onPress={() => handleOpenSessionSheet(session)}
                  style={({ pressed }) => [
                    styles.adjustButton,
                    pressed && styles.pressed,
                  ]}>
                  <Text style={styles.adjustButtonText}>세트·횟수 조절</Text>
                </Pressable>
              </View>

              {/* 종목 간 휴식 카드 */}
              {index < sessions.length - 1 ? (
                <View style={styles.restCard}>
                  <Text style={styles.restTitle}>휴식</Text>
                  <Text style={styles.restDesc}>
                    {`종목 간 ${interExerciseRestSeconds}초 휴식`}
                  </Text>
                </View>
              ) : null}
            </React.Fragment>
          ))}

          {/* 마무리 카드 */}
          <View style={styles.restCard}>
            <Text style={styles.restTitle}>마무리</Text>
            <Text style={styles.restDesc}>스트레칭 및 호흡 정리</Text>
          </View>
        </View>
      </ScrollView>

      {/* 하단 고정 '운동 시작하기' CTA 버튼 */}
      <View
        pointerEvents="box-none"
        style={[
          styles.footer,
          { bottom: Math.max(insets.bottom, 16) },
        ]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="운동 시작하기"
          onPress={handleStartWorkout}
          style={({ pressed }) => [
            styles.startButton,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.startButtonText}>운동 시작하기</Text>
        </Pressable>
      </View>

      {/* 세트·횟수 조절 바텀시트 모달 */}
      <Modal
        visible={editingSession !== null}
        transparent
        animationType="fade"
        onRequestClose={handleCloseSessionSheet}>
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalDismissArea}
            onPress={handleCloseSessionSheet}
          />

          {editingSession ? (
            <View
              style={[
                styles.sheetContainer,
                { paddingBottom: Math.max(insets.bottom, 20) + 8 },
              ]}>
              {/* 상단 그랩 바 */}
              <View style={styles.sheetHandle} />

              {/* 종목 타이틀 & 썸네일 */}
              <View style={styles.sheetHeaderRow}>
                <View style={styles.sheetTitleGroup}>
                  <Text style={styles.sheetExerciseTitle}>
                    {editingSession.name}
                  </Text>
                  <Text style={styles.sheetExerciseSubtitle}>
                    {editingSession.partAndLevel}
                  </Text>
                </View>

                <View style={styles.sheetThumbnail} />
              </View>

              {/* 세트 수 조절 카드 */}
              <View style={styles.stepperCard}>
                <Text style={styles.stepperLabel}>세트 수</Text>
                <View style={styles.stepperValueRow}>
                  <Text style={styles.stepperValueText}>
                    {`${draftSets}세트`}
                  </Text>

                  <View style={styles.stepperControlPill}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="세트 수 감소"
                      disabled={draftSets <= MIN_SETS}
                      onPress={() =>
                        setDraftSets((prev) => Math.max(MIN_SETS, prev - 1))
                      }
                      style={({ pressed }) => [
                        styles.stepperButton,
                        pressed && styles.pressed,
                      ]}>
                      <MinusIcon
                        color={draftSets <= MIN_SETS ? '#A1A1AA' : '#111111'}
                        size={14}
                      />
                    </Pressable>

                    <View style={styles.stepperDivider} />

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="세트 수 증가"
                      disabled={draftSets >= MAX_SETS}
                      onPress={() =>
                        setDraftSets((prev) => Math.min(MAX_SETS, prev + 1))
                      }
                      style={({ pressed }) => [
                        styles.stepperButton,
                        pressed && styles.pressed,
                      ]}>
                      <PlusIcon
                        color={draftSets >= MAX_SETS ? '#A1A1AA' : '#111111'}
                        size={14}
                      />
                    </Pressable>
                  </View>
                </View>
              </View>

              {/* 세트당 횟수 조절 카드 */}
              <View style={styles.stepperCard}>
                <Text style={styles.stepperLabel}>세트당 횟수</Text>
                <View style={styles.stepperValueRow}>
                  <Text style={styles.stepperValueText}>
                    {`${draftReps}회`}
                  </Text>

                  <View style={styles.stepperControlPill}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="세트당 횟수 감소"
                      disabled={draftReps <= MIN_REPS}
                      onPress={() =>
                        setDraftReps((prev) => Math.max(MIN_REPS, prev - 1))
                      }
                      style={({ pressed }) => [
                        styles.stepperButton,
                        pressed && styles.pressed,
                      ]}>
                      <MinusIcon
                        color={draftReps <= MIN_REPS ? '#A1A1AA' : '#111111'}
                        size={14}
                      />
                    </Pressable>

                    <View style={styles.stepperDivider} />

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="세트당 횟수 증가"
                      disabled={draftReps >= MAX_REPS}
                      onPress={() =>
                        setDraftReps((prev) => Math.min(MAX_REPS, prev + 1))
                      }
                      style={({ pressed }) => [
                        styles.stepperButton,
                        pressed && styles.pressed,
                      ]}>
                      <PlusIcon
                        color={draftReps >= MAX_REPS ? '#A1A1AA' : '#111111'}
                        size={14}
                      />
                    </Pressable>
                  </View>
                </View>
              </View>

              {/* 세션 저장 버튼 */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="세션 저장"
                onPress={handleSaveSession}
                style={({ pressed }) => [
                  styles.saveSessionButton,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.saveSessionButtonText}>세션 저장</Text>
              </Pressable>

              {/* 변경사항 되돌리기 */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="변경사항 되돌리기"
                onPress={handleRevertSession}
                style={({ pressed }) => [
                  styles.revertButton,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.revertButtonText}>변경사항 되돌리기</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  circleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  titleSection: {
    marginBottom: 22,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.5,
  },
  routineSubtitle: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '500',
    color: '#60646C',
    letterSpacing: -0.3,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  tagChip: {
    backgroundColor: '#EBEBED',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#71717A',
    letterSpacing: -0.2,
  },
  sessionList: {
    gap: 12,
  },
  exerciseCard: {
    backgroundColor: '#E4E4E7',
    borderRadius: 14,
    paddingTop: 20,
    paddingBottom: 18,
    paddingHorizontal: 18,
  },
  exerciseTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.3,
  },
  exerciseMetaGroup: {
    marginTop: 12,
    gap: 4,
  },
  exerciseVolumeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#52525B',
    letterSpacing: -0.2,
  },
  exerciseRestText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#71717A',
    letterSpacing: -0.2,
  },
  adjustButton: {
    marginTop: 16,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.2,
  },
  restCard: {
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 18,
  },
  restTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.3,
  },
  restDesc: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '400',
    color: '#71717A',
    letterSpacing: -0.2,
  },
  footer: {
    position: 'absolute',
    left: 20,
    right: 20,
  },
  startButton: {
    height: 54,
    borderRadius: 27,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.36)',
    justifyContent: 'flex-end',
  },
  modalDismissArea: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E4E4E7',
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 12,
  },
  sheetTitleGroup: {
    flex: 1,
    paddingRight: 16,
  },
  sheetExerciseTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.4,
  },
  sheetExerciseSubtitle: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '500',
    color: '#71717A',
    letterSpacing: -0.2,
  },
  sheetThumbnail: {
    width: 44,
    height: 44,
    borderRadius: 4,
    backgroundColor: '#D9D9D9',
  },
  stepperCard: {
    marginTop: 12,
    backgroundColor: '#F4F4F5',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  stepperLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: -0.2,
  },
  stepperValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  stepperValueText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#52525B',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  stepperControlPill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E4E4E7',
  },
  stepperButton: {
    width: 44,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperDivider: {
    width: 1,
    height: 14,
    backgroundColor: '#C4C4C8',
  },
  saveSessionButton: {
    marginTop: 26,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveSessionButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  revertButton: {
    marginTop: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revertButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#71717A',
    letterSpacing: -0.2,
  },
  pressed: {
    opacity: 0.75,
  },
});
