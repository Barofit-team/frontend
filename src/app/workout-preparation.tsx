/**
 * 운동 준비 Workout Flow: Place device → Adjust Angle → User Position(대기·완료)
 * Exercise 화면은 별도 구현 예정입니다.
 *
 * Adjust Angle
 *  - 센서 모드(기본): expo-sensors DeviceMotion으로 앞뒤 설치 각도를 측정해
 *    "더 세워주세요 / 더 눕혀주세요 / 완벽해요" 상태를 자동으로 표시합니다.
 *    완료 상태가 일정 시간 유지되면 User Position으로 이동합니다(개발 모드에서는 기본 OFF).
 *  - 수동 모드([DEV]): 센서 없이 기존 6개 화면을 ◀ ▶로 확인합니다.
 *
 * User Position은 여전히 정적 UI입니다(카메라·자세 인식 미연결).
 *
 * 개발용 진입 파라미터
 *  - barofit://workout-preparation?mode=manual&step=adjust-angle-2
 *  - step만 adjust-angle-2/3으로 주면 수동 모드로 엽니다(이전 동작 호환).
 */
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PreparationDevControls } from '@/components/workout-preparation/PreparationDevControls';
import { PreparationStepView } from '@/components/workout-preparation/PreparationStepView';
import {
  getAdjacentStep,
  isAdjustAngleStep,
  isPreparationStep,
  type PreparationMode,
  type PreparationStep,
} from '@/components/workout-preparation/steps';
import { useDevicePitch } from '@/components/workout-preparation/useDevicePitch';

function initialMode(modeParam: string | undefined, step: PreparationStep): PreparationMode {
  if (!__DEV__) return 'sensor';
  if (modeParam === 'manual' || modeParam === 'sensor') return modeParam;
  return step === 'adjust-angle-2' || step === 'adjust-angle-3' ? 'manual' : 'sensor';
}

export default function WorkoutPreparationScreen() {
  const params = useLocalSearchParams<{ step?: string; mode?: string }>();
  const [step, setStep] = useState<PreparationStep>(() =>
    isPreparationStep(params.step) ? params.step : 'place-device'
  );
  const [mode, setMode] = useState<PreparationMode>(() => initialMode(params.mode, step));
  // 정식 빌드: 완료 유지 시 자동 이동. 개발 빌드: 테스트 방해를 막기 위해 기본 OFF
  const [autoAdvance, setAutoAdvance] = useState(!__DEV__);
  const insets = useSafeAreaInsets();

  const goToUserPosition = useCallback(() => setStep('user-position'), []);
  const pitch = useDevicePitch({
    enabled: mode === 'sensor' && isAdjustAngleStep(step),
    autoAdvance,
    onStableAligned: goToUserPosition,
  });

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  }, []);

  const move = useCallback(
    (offset: 1 | -1) => setStep(current => getAdjacentStep(current, offset, mode) ?? current),
    [mode]
  );

  const toggleMode = useCallback(() => {
    setMode(m => (m === 'sensor' ? 'manual' : 'sensor'));
    // 센서 모드에서는 Adjust Angle 1~3이 한 단계이므로 진입 단계로 맞춤
    setStep(s => (isAdjustAngleStep(s) ? 'adjust-angle-1' : s));
  }, []);

  // Android 뒤로가기: 이전 단계로, 첫 단계에서는 화면 닫기
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const prev = getAdjacentStep(step, -1, mode);
      if (prev) setStep(prev);
      else close();
      return true;
    });
    return () => sub.remove();
  }, [step, mode, close]);

  const sensorAdjust = mode === 'sensor' && isAdjustAngleStep(step);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <PreparationStepView
        step={step}
        onPressDone={() => move(1)}
        onPressClose={close}
        liveAngle={
          sensorAdjust
            ? { status: pitch.status, sensor: pitch.sensor, indicator: pitch.indicator, onRetry: pitch.retry }
            : undefined
        }
      />
      <PreparationDevControls
        step={step}
        mode={mode}
        top={insets.top + 54}
        bottom={insets.bottom}
        onPrev={() => move(-1)}
        onNext={() => move(1)}
        onToggleMode={toggleMode}
        sensor={
          sensorAdjust
            ? {
                diagnostics: pitch.diagnostics,
                autoAdvance,
                onToggleAutoAdvance: () => setAutoAdvance(v => !v),
                onCaptureTarget: pitch.captureTarget,
                onClearTarget: pitch.clearTarget,
              }
            : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
