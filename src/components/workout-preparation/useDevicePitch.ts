/**
 * expo-sensors DeviceMotion으로 앞뒤 설치 각도를 측정하고 Adjust Angle 상태를 판정하는 훅.
 *
 * 렌더링 정책
 *  - 센서 이벤트(약 16Hz)마다 React state를 바꾸지 않습니다.
 *  - 인디케이터 위치는 Animated.Value(indicator)를 직접 갱신 → 화면 리렌더 없음.
 *  - status는 값이 바뀔 때만 state 갱신.
 *
 * 생명주기
 *  - enabled=true(= Adjust Angle 단계)이고 앱이 active일 때만 구독.
 *  - 단계 이탈 / 화면 종료 / 백그라운드 전환 시 subscription.remove().
 */
import { DeviceMotion, type DeviceMotionMeasurement } from 'expo-sensors';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Platform, type AppStateStatus } from 'react-native';

import { ANGLE_CONFIG } from './angleConfig';
import {
  indicatorRatio,
  nextAngleStatus,
  pitchFromGravity,
  smoothAngle,
  type AngleStatus,
} from './pitch';

export type SensorState =
  | 'idle'
  | 'checking'
  | 'active'
  | 'no-data'
  | 'not-available'
  | 'permission-denied'
  | 'error';

type Options = {
  enabled: boolean;
  /** 완료 상태가 holdMs 이상 유지되면 호출 */
  onStableAligned?: () => void;
};

type LiveState = {
  smoothed: number | null;
  lastTs: number;
  lastSampleAt: number;
  status: AngleStatus;
  alignedSince: number | null;
  advanced: boolean;
};

function normalizeGravity(g: { x: number; y: number; z: number }) {
  return Platform.OS === 'web' ? { x: -g.x, y: -g.y, z: -g.z } : { x: g.x, y: g.y, z: g.z };
}

function freshLive(): LiveState {
  return {
    smoothed: null,
    lastTs: 0,
    lastSampleAt: 0,
    status: 'initializing',
    alignedSince: null,
    advanced: false,
  };
}

export function useDevicePitch({ enabled, onStableAligned }: Options) {
  const targetDeg = ANGLE_CONFIG.defaultTargetDeg ?? 70;
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [retryKey, setRetryKey] = useState(0);
  const [indicator] = useState(() => new Animated.Value(0));

  const session = enabled && appActive ? `on-${retryKey}` : 'off';
  const [sensorState, setSensorState] = useState<{ session: string; value: SensorState }>({
    session: 'off',
    value: 'idle',
  });
  const [statusState, setStatusState] = useState<{ session: string; value: AngleStatus }>({
    session: 'off',
    value: 'initializing',
  });

  const sensor: SensorState =
    session === 'off' ? 'idle' : sensorState.session === session ? sensorState.value : 'checking';
  const status: AngleStatus = statusState.session === session ? statusState.value : 'initializing';

  const live = useRef<LiveState>(freshLive());
  const latest = useRef({ targetDeg, onStableAligned });
  useEffect(() => {
    latest.current = { targetDeg, onStableAligned };
  }, [targetDeg, onStableAligned]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

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
      L.status = next;
      if (next !== 'aligned') L.alignedSince = null;
      setStatusState({ session, value: next });
    };
    const fail = (state: SensorState) => {
      if (cancelled) return;
      setSensor(state);
      updateStatus('unavailable');
      indicator.setValue(0);
    };

    const onSample = (m: DeviceMotionMeasurement) => {
      const now = Date.now();
      const { targetDeg: target, onStableAligned: onAligned } = latest.current;
      const rawG = m?.accelerationIncludingGravity;
      const g = rawG ? normalizeGravity(rawG) : null;
      const sample = pitchFromGravity(g);
      if (!sample.valid) {
        return;
      }
      L.lastSampleAt = now;
      L.smoothed = smoothAngle(L.smoothed, sample.pitchDeg, L.lastTs ? now - L.lastTs : 0);
      L.lastTs = now;

      const error = L.smoothed - target;
      const base = L.status === 'aligned' || L.status.startsWith('needs-') ? L.status : 'initializing';
      updateStatus(nextAngleStatus(base, error));
      indicator.setValue(indicatorRatio(error));
      if (L.status === 'aligned') {
        if (L.alignedSince === null) L.alignedSince = now;
        if (!L.advanced && now - L.alignedSince >= ANGLE_CONFIG.holdMs) {
          L.advanced = true;
          onAligned?.();
        }
      }
    };

    void (async () => {
      try {
        const available = await DeviceMotion.isAvailableAsync();
        if (cancelled) return;
        if (!available) return fail('not-available');

        if (typeof DeviceMotion.getPermissionsAsync === 'function') {
          let perm = await DeviceMotion.getPermissionsAsync();
          if (cancelled) return;
          if (!perm.granted && perm.canAskAgain && typeof DeviceMotion.requestPermissionsAsync === 'function') {
            perm = await DeviceMotion.requestPermissionsAsync();
            if (cancelled) return;
          }
          if (!perm.granted) return fail('permission-denied');
        }

        DeviceMotion.setUpdateInterval(ANGLE_CONFIG.updateIntervalMs);
        const startedAt = Date.now();
        setSensor('active');
        subscription = DeviceMotion.addListener(onSample);

        watchdog = setInterval(() => {
          const now = Date.now();
          const since = L.lastSampleAt ? now - L.lastSampleAt : now - startedAt;
          if (since >= ANGLE_CONFIG.noDataTimeoutMs && L.status !== 'unavailable') {
            fail('no-data');
          }
        }, 400);
      } catch {
        fail('error');
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
      if (watchdog) clearInterval(watchdog);
    };
  }, [session, indicator]);

  const retry = useCallback(() => setRetryKey(k => k + 1), []);

  return {
    sensor,
    status,
    indicator,
    retry,
  };
}
