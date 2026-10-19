/**
 * expo-sensors DeviceMotion으로 앞뒤 설치 각도를 측정하고 Adjust Angle 상태를 판정하는 훅.
 *
 * 렌더링 정책
 *  - 센서 이벤트(약 16Hz)마다 React state를 바꾸지 않습니다.
 *  - 인디케이터 위치는 Animated.Value(indicator)를 직접 갱신 → 화면 리렌더 없음.
 *  - status는 값이 바뀔 때만 state 갱신.
 *  - 개발용 진단값은 __DEV__에서만 250ms 간격으로 state 갱신, 콘솔 로그는 1초에 1회.
 *
 * 생명주기
 *  - enabled=true(= Adjust Angle 단계 + 센서 모드)이고 앱이 active일 때만 구독.
 *  - 단계 이탈 / 화면 종료 / 백그라운드 전환 시 subscription.remove().
 *  - 구독 단위(session)마다 상태를 새로 시작합니다. (재시도 = 새 session)
 */
import { DeviceMotion, type DeviceMotionMeasurement } from 'expo-sensors';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Platform, type AppStateStatus } from 'react-native';

import { ANGLE_CONFIG } from './angleConfig';
import { useAngleTargetStore } from './angleTargetStore';
import {
  indicatorRatio,
  nextAngleStatus,
  pitchFromGravity,
  radToDeg,
  smoothAngle,
  type AngleStatus,
} from './pitch';

const LOG = '[AdjustAngle]';

export type SensorState =
  'idle' | 'checking' | 'active' | 'no-data' | 'not-available' | 'permission-denied' | 'error';

export type PitchDiagnostics = {
  sensor: SensorState;
  /** 원시값: accelerationIncludingGravity (m/s²) */
  gravity: { x: number; y: number; z: number } | null;
  /** 원시값: rotation.beta를 도(°)로 변환한 참고값 */
  betaDeg: number | null;
  /** 계산값: 이번 샘플 설치 각도 */
  rawPitchDeg: number | null;
  /** 계산값: 스무딩 후 설치 각도 */
  pitchDeg: number | null;
  magnitudeG: number | null;
  targetDeg: number | null;
  errorDeg: number | null;
  status: AngleStatus;
  /** 마지막 유효 샘플 이후 경과(ms) */
  lastSampleAgeMs: number | null;
  samplesPerSec: number;
  /** 흔들림 등으로 버린 샘플 수 */
  invalidSamples: number;
  alignedForMs: number;
  reportedIntervalMs: number | null;
};

type Options = {
  enabled: boolean;
  /** 완료 상태가 holdMs 이상 유지되면 호출 */
  onStableAligned?: () => void;
  autoAdvance: boolean;
};

type RawSample = {
  g: { x: number; y: number; z: number } | null;
  beta: number | null;
  pitch: number | null;
  mag: number | null;
  interval: number | null;
};

type LiveState = {
  smoothed: number | null;
  lastTs: number;
  lastSampleAt: number;
  status: AngleStatus;
  alignedSince: number | null;
  advanced: boolean;
  invalid: number;
  count: number;
  countStart: number;
  lastDiagAt: number;
  lastLogAt: number;
  raw: RawSample;
};

/**
 * 플랫폼별 부호 정규화 → "땅 방향을 가리키는 중력 벡터"(iOS 네이티브 규약)로 통일.
 *  - iOS/Android: expo-sensors 네이티브 모듈이 이미 이 규약으로 전달 (pitch.ts 주석 참고)
 *  - Web: expo-sensors가 브라우저 W3C DeviceMotionEvent 값을 그대로 전달하며,
 *         W3C 규약은 화면 위로 눕혔을 때 z ≈ +9.8 (반대 부호) → 부호 반전
 */
function normalizeGravity(g: { x: number; y: number; z: number }) {
  return Platform.OS === 'web' ? { x: -g.x, y: -g.y, z: -g.z } : { x: g.x, y: g.y, z: g.z };
}

const EMPTY_RAW: RawSample = { g: null, beta: null, pitch: null, mag: null, interval: null };

const EMPTY_DIAG: Omit<PitchDiagnostics, 'sensor' | 'status' | 'targetDeg'> = {
  gravity: null,
  betaDeg: null,
  rawPitchDeg: null,
  pitchDeg: null,
  magnitudeG: null,
  errorDeg: null,
  lastSampleAgeMs: null,
  samplesPerSec: 0,
  invalidSamples: 0,
  alignedForMs: 0,
  reportedIntervalMs: null,
};

function freshLive(): LiveState {
  return {
    smoothed: null,
    lastTs: 0,
    lastSampleAt: 0,
    status: 'initializing',
    alignedSince: null,
    advanced: false,
    invalid: 0,
    count: 0,
    countStart: Date.now(),
    lastDiagAt: 0,
    lastLogAt: 0,
    raw: EMPTY_RAW,
  };
}

export function useDevicePitch({ enabled, onStableAligned, autoAdvance }: Options) {
  const targetDeg = useAngleTargetStore(s => s.targetDeg);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [retryKey, setRetryKey] = useState(0);
  const [indicator] = useState(() => new Animated.Value(0));

  // 구독 단위 식별자. 값이 바뀌면 이전 session의 상태는 무시됨
  const session = enabled && appActive ? `on-${retryKey}` : 'off';
  const [sensorState, setSensorState] = useState<{ session: string; value: SensorState }>({
    session: 'off',
    value: 'idle',
  });
  const [statusState, setStatusState] = useState<{ session: string; value: AngleStatus }>({
    session: 'off',
    value: 'initializing',
  });
  const [diagState, setDiagState] = useState<{ session: string; value: typeof EMPTY_DIAG }>({
    session: 'off',
    value: EMPTY_DIAG,
  });

  const sensor: SensorState =
    session === 'off' ? 'idle' : sensorState.session === session ? sensorState.value : 'checking';
  let status: AngleStatus = statusState.session === session ? statusState.value : 'initializing';
  if (targetDeg === null && status !== 'unavailable') status = 'no-target';

  // 리스너가 최신 props를 읽기 위한 ref (렌더 중에는 쓰지 않음)
  const live = useRef<LiveState>(freshLive());
  const latest = useRef({ targetDeg, autoAdvance, onStableAligned });
  useEffect(() => {
    latest.current = { targetDeg, autoAdvance, onStableAligned };
  }, [targetDeg, autoAdvance, onStableAligned]);

  // 목표 변경 시 완료 유지 시간 초기화
  useEffect(() => {
    live.current.alignedSince = null;
    live.current.advanced = false;
  }, [targetDeg]);

  // 앱 포그라운드/백그라운드
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  // 센서 구독
  useEffect(() => {
    if (session === 'off') return;
    let cancelled = false;
    let subscription: { remove: () => void } | null = null;
    let watchdog: ReturnType<typeof setInterval> | null = null;
    const L = freshLive();
    live.current = L;
    indicator.setValue(0);

    const setSensor = (value: SensorState) => {
      if (!cancelled) setSensorState({ session, value });
    };
    const updateStatus = (next: AngleStatus) => {
      if (cancelled || L.status === next) return;
      if (__DEV__) console.log(LOG, 'status', L.status, '→', next);
      L.status = next;
      if (next !== 'aligned') L.alignedSince = null;
      setStatusState({ session, value: next });
    };
    const fail = (state: SensorState, reason: unknown) => {
      if (cancelled) return;
      if (__DEV__) console.warn(LOG, 'sensor', state, String(reason ?? ''));
      setSensor(state);
      updateStatus('unavailable');
      indicator.setValue(0);
    };

    const onSample = (m: DeviceMotionMeasurement) => {
      const now = Date.now();
      const { targetDeg: target, autoAdvance: auto, onStableAligned: onAligned } = latest.current;
      const rawG = m?.accelerationIncludingGravity;
      const g = rawG ? normalizeGravity(rawG) : null;
      const sample = pitchFromGravity(g);
      const beta = m?.rotation && Number.isFinite(m.rotation.beta) ? radToDeg(m.rotation.beta) : null;
      L.raw = {
        g,
        beta,
        pitch: sample.valid ? sample.pitchDeg : null,
        mag: Number.isFinite(sample.magnitudeG) ? sample.magnitudeG : null,
        interval: m?.interval ?? null,
      };
      L.count++;
      if (!sample.valid) {
        L.invalid++;
        return; // 흔들림 등 유효하지 않은 샘플은 판정에 쓰지 않음 (임의 완료 금지)
      }
      L.lastSampleAt = now;
      L.smoothed = smoothAngle(L.smoothed, sample.pitchDeg, L.lastTs ? now - L.lastTs : 0);
      L.lastTs = now;

      if (target === null) {
        updateStatus('no-target');
        indicator.setValue(0);
      } else {
        const error = L.smoothed - target;
        const base = L.status === 'aligned' || L.status.startsWith('needs-') ? L.status : 'initializing';
        updateStatus(nextAngleStatus(base, error));
        indicator.setValue(indicatorRatio(error));
        if (L.status === 'aligned') {
          if (L.alignedSince === null) L.alignedSince = now;
          if (!L.advanced && auto && now - L.alignedSince >= ANGLE_CONFIG.holdMs) {
            L.advanced = true;
            if (__DEV__) console.log(LOG, 'stable aligned → next step');
            onAligned?.();
          }
        }
      }

      if (__DEV__ && g && now - L.lastLogAt >= 1000) {
        L.lastLogAt = now;
        console.log(
          LOG,
          `g=(${g.x.toFixed(2)},${g.y.toFixed(2)},${g.z.toFixed(2)}) beta=${beta?.toFixed(1)}° ` +
            `pitch=${sample.pitchDeg.toFixed(1)}° smooth=${L.smoothed.toFixed(1)}° target=${target ?? '-'} status=${L.status}`
        );
      }
    };

    (async () => {
      try {
        const available = await DeviceMotion.isAvailableAsync();
        if (cancelled) return;
        if (!available) return fail('not-available', 'isAvailableAsync=false');
        const perm = await DeviceMotion.getPermissionsAsync();
        const granted = perm.granted || (await DeviceMotion.requestPermissionsAsync()).granted;
        if (cancelled) return;
        if (!granted) return fail('permission-denied', perm.status);
        try {
          DeviceMotion.setUpdateInterval(ANGLE_CONFIG.updateIntervalMs);
        } catch (e) {
          // Web 구현에는 setUpdateInterval이 없음(UnavailabilityError). 기본 주기로 계속 진행
          if (__DEV__) console.log(LOG, 'setUpdateInterval unsupported:', e instanceof Error ? e.message : e);
        }
        subscription = DeviceMotion.addListener(onSample);
        if (cancelled) {
          subscription.remove();
          return;
        }
        if (__DEV__) console.log(LOG, 'subscribed', `${ANGLE_CONFIG.updateIntervalMs}ms`);
        const startedAt = Date.now();
        watchdog = setInterval(() => {
          const now = Date.now();
          const stale = now - (L.lastSampleAt || startedAt) > ANGLE_CONFIG.noDataTimeoutMs;
          if (stale) {
            setSensor('no-data');
            updateStatus('unavailable');
            indicator.setValue(0);
          } else {
            setSensor('active');
          }
          if (__DEV__) {
            const secs = (now - L.countStart) / 1000;
            const target = latest.current.targetDeg;
            setDiagState({
              session,
              value: {
                gravity: L.raw.g,
                betaDeg: L.raw.beta,
                rawPitchDeg: L.raw.pitch,
                pitchDeg: L.smoothed,
                magnitudeG: L.raw.mag,
                errorDeg: L.smoothed !== null && target !== null ? L.smoothed - target : null,
                lastSampleAgeMs: L.lastSampleAt ? now - L.lastSampleAt : null,
                samplesPerSec: secs > 0 ? L.count / secs : 0,
                invalidSamples: L.invalid,
                alignedForMs: L.alignedSince ? now - L.alignedSince : 0,
                reportedIntervalMs: L.raw.interval,
              },
            });
          }
        }, 250);
      } catch (e) {
        fail('error', e instanceof Error ? e.message : e);
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
      if (watchdog) clearInterval(watchdog);
      if (__DEV__ && subscription) console.log(LOG, 'unsubscribed');
    };
  }, [session, indicator]);

  const retry = useCallback(() => setRetryKey(k => k + 1), []);

  /** [개발용] 현재 스무딩된 각도를 목표로 지정 */
  const captureTarget = useCallback(() => {
    const v = live.current.smoothed;
    if (v !== null && Number.isFinite(v)) {
      const rounded = Math.round(v * 10) / 10;
      useAngleTargetStore.getState().setTargetDeg(rounded);
      if (__DEV__) console.log(LOG, 'target set', rounded);
    }
  }, []);

  const clearTarget = useCallback(() => useAngleTargetStore.getState().setTargetDeg(null), []);

  const diag = diagState.session === session ? diagState.value : EMPTY_DIAG;

  return {
    status,
    sensor,
    /** -1(기준선 위) ~ 1(아래). AngleAdjustmentGuide의 liveOffset으로 전달 */
    indicator,
    diagnostics: { ...diag, sensor, status, targetDeg } satisfies PitchDiagnostics,
    targetDeg,
    retry,
    captureTarget,
    clearTarget,
  };
}
