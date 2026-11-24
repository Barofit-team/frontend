/**
 * 운동 준비 Workout Flow: Place device → Adjust Angle → User Position(대기·완료) → Exercise
 */
import { READINESS_PROFILES } from '@barofit/pose';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';

import { PreparationStepView, isGrayStep } from '@/components/workout-preparation/PreparationStepView';
import {
  PREPARATION_STEPS,
  getAdjacentStep,
  isAdjustAngleStep,
  isPreparationStep,
  stepIndex,
  type PreparationStep,
} from '@/components/workout-preparation/steps';
import { useDevicePitch } from '@/components/workout-preparation/useDevicePitch';
import { useCameraReadiness } from '@/hooks/useCameraReadiness';
import { readinessAvailability } from '@/services/poseExerciseIds';
import { playLocalMp3 } from '@/services/ttsService';
import { useTodayRoutineStore } from '@/stores/useTodayRoutineStore';
import { useTtsStore } from '@/stores/useTtsStore';

const USER_POSITION_AUDIO = require('../../assets/audio/user_position_guide.mp3');
const USER_POSITION_TTS_TEXT = '전신이 보이게 영역 안에 서주세요';

/**
 * 개발용 단계 이동 pill(‹ 1/4 ›). 1차 디자인에 없어 기본 숨김.
 * 개발 빌드에서 EXPO_PUBLIC_F03_STEP_NAV=1 일 때만 표시합니다.
 */
const SHOW_DEV_STEP_NAV = __DEV__ && process.env.EXPO_PUBLIC_F03_STEP_NAV === '1';

/** '자세 인식 완료!' 화면을 보여준 뒤 운동 진행 화면으로 넘어가기까지의 시간 */
const SESSION_ENTRY_DELAY_MS = 1500;

export default function WorkoutPreparationScreen() {
  const params = useLocalSearchParams<{ step?: string; exerciseId?: string }>();
  const [step, setStep] = useState<PreparationStep>(() =>
    isPreparationStep(params.step) ? params.step : 'place-device'
  );

  // 오늘 루틴 또는 파라미터에서 현재 운동 식별. 운동이 없거나 해당 운동의 AI readiness 프로필이 없으면
  // 다른 운동(푸시업) 프로필로 대체하지 않는다 → readiness 미실행(준비 완료로 판단하지 않음)
  const todaySessions = useTodayRoutineStore(state => state.sessions);
  const readinessTarget = useMemo(
    () => readinessAvailability(params.exerciseId || todaySessions[0]?.exerciseId,
      poseId => Object.prototype.hasOwnProperty.call(READINESS_PROFILES, poseId)),
    [params.exerciseId, todaySessions],
  );

  // 실시간 관절 준비 상태 머신 연동
  const readiness = useCameraReadiness({
    exercise: readinessTarget.poseId,
    enabled: step === 'user-position' || step === 'user-position-complete',
    lockOnReady: true,
    onReady: useCallback(() => {
      // 1초 연속 관절 확보 시 1회만 호출됨 -> '자세 인식 완료!' 화면으로 전환
      setStep('user-position-complete');
    }, []),
  });

  const goToUserPosition = useCallback(() => setStep('user-position'), []);
  const pitch = useDevicePitch({
    enabled: isAdjustAngleStep(step),
    onStableAligned: goToUserPosition,
  });

  const cameraReadySpokenRef = useRef(false);
  const voiceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearVoiceTimer = useCallback(() => {
    if (voiceTimerRef.current) {
      clearTimeout(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
  }, []);

  const playUserPositionVoice = useCallback(() => {
    void playLocalMp3(USER_POSITION_AUDIO, USER_POSITION_TTS_TEXT);
  }, []);

  const handlePressVoice = useCallback(() => {
    if (step === 'place-device') {
      useTtsStore.getState().playSpeech('기기를 비스듬하게 벽에 세워주세요', 'PREP_GUIDE');
    } else if (step === 'adjust-angle-1') {
      useTtsStore.getState().playSpeech('원과 점선이 겹치도록 각도를 조절해주세요', 'PREP_GUIDE');
    } else {
      playUserPositionVoice();
    }
  }, [step, playUserPositionVoice]);

  // '전신이 보이게 영역 안에 서주세요' (user-position) 단계 진입 시
  // 카메라 AVCaptureSession 시작 직후(onCameraReady) 또는 900ms 폴백 타이머로 음성 출력
  useEffect(() => {
    clearVoiceTimer();
    if (step === 'user-position') {
      cameraReadySpokenRef.current = false;
      voiceTimerRef.current = setTimeout(() => {
        voiceTimerRef.current = null;
        if (!cameraReadySpokenRef.current) {
          playUserPositionVoice();
        }
      }, 900);
    } else if (step !== 'user-position-complete') {
      cameraReadySpokenRef.current = false;
      useTtsStore.getState().stop();
    }
    return clearVoiceTimer;
  }, [step, playUserPositionVoice, clearVoiceTimer]);

  useEffect(() => {
    return () => {
      clearVoiceTimer();
      useTtsStore.getState().stop();
    };
  }, [clearVoiceTimer]);

  // 카메라 하드웨어 시작(AVCaptureSession.startRunning) 완료 직후 오디오 세션을 재확보하고 음성 출력
  const handleCameraReady = useCallback(() => {
    if (step !== 'user-position') return;
    clearVoiceTimer();
    cameraReadySpokenRef.current = true;
    voiceTimerRef.current = setTimeout(() => {
      voiceTimerRef.current = null;
      playUserPositionVoice();
    }, 150);
  }, [step, playUserPositionVoice, clearVoiceTimer]);

  const close = useCallback(() => {
    useTtsStore.getState().stop();
    readiness.breakContinuity('pause');
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  }, [readiness]);

  // 자세 인식 완료 → 완료 화면을 1.5초 보여준 뒤 운동 진행 화면으로 이동
  useEffect(() => {
    if (step !== 'user-position-complete') return;
    const timer = setTimeout(() => {
      useTtsStore.getState().stop();
      router.replace('/workout-session');
    }, SESSION_ENTRY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [step]);

  const move = useCallback(
    (offset: 1 | -1) =>
      setStep(current => {
        const next = getAdjacentStep(current, offset) ?? current;
        if (current === 'user-position-complete' && next === 'user-position') {
          readiness.reset();
        }
        return next;
      }),
    [readiness]
  );

  // Android 뒤로가기: 이전 단계로, 첫 단계에서는 화면 닫기
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const prev = getAdjacentStep(step, -1);
      if (prev) {
        if (step === 'user-position-complete' && prev === 'user-position') {
          readiness.reset();
        }
        setStep(prev);
      } else {
        close();
      }
      return true;
    });
    return () => sub.remove();
  }, [step, close, readiness]);

  const idx = stepIndex(step);
  const totalSteps = PREPARATION_STEPS.length;

  return (
    <View style={styles.container}>
      <StatusBar style={isGrayStep(step) ? 'light' : 'dark'} />
      <PreparationStepView
        step={step}
        onPressDone={() => move(1)}
        onPressClose={close}
        onPressBack={() => move(-1)}
        onPressVoice={handlePressVoice}
        stepNav={
          SHOW_DEV_STEP_NAV
            ? {
                current: idx + 1,
                total: totalSteps,
                canPrev: idx > 0,
                canNext: idx < totalSteps - 1,
                onPrev: () => move(-1),
                onNext: () => move(1),
              }
            : undefined
        }
        onCameraReady={handleCameraReady}
        onPoseFrame={readiness.pushFrame}
        readiness={{
          status: readiness.status,
          message: readiness.message,
          detailMessage: readiness.detailMessage,
          isReady: readiness.isReady,
          selectedSide: readiness.activeSide ?? 'both',
          recognizedJointCount: readiness.recognizedJointCount,
          requiredJointCount: readiness.requiredJointCount,
          stabilityProgress: readiness.stabilityProgress,
        }}
        liveAngle={{
          status: pitch.status,
          sensor: pitch.sensor,
          indicator: pitch.indicator,
          onRetry: pitch.retry,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
