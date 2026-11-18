import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CameraReadiness,
  READINESS_PROFILES,
  type CameraReadinessResult,
  type PoseFrame,
} from '@barofit/pose';

export type JointRecognitionState = 'recognized' | 'missing' | 'out_of_frame' | 'inactive';

const JOINT_LABELS_KO: Record<string, string> = {
  shoulder: '어깨',
  elbow: '팔꿈치',
  wrist: '손목',
  hip: '골반',
  knee: '무릎',
  ankle: '발목',
  heel: '발뒤꿈치',
  foot_index: '발끝',
};

const ALL_SILHOUETTE_JOINTS = [
  'shoulder',
  'elbow',
  'wrist',
  'hip',
  'knee',
  'ankle',
  'heel',
  'foot_index',
] as const;

function formatJointListKo(landmarks: string[]): string[] {
  const uniqueLabels = new Set<string>();
  for (const item of landmarks) {
    const rawName = item.replace(/^(left_|right_)/, '');
    const ko = JOINT_LABELS_KO[rawName] ?? rawName;
    uniqueLabels.add(ko);
  }
  return Array.from(uniqueLabels);
}

export interface UseCameraReadinessOptions {
  exercise: string;
  side?: 'left' | 'right' | null;
  stableMs?: number;
  enabled?: boolean;
  /** true일 때 한 번 ready 달성 시 reset/breakContinuity 전까지 통과 상태를 유지합니다 */
  lockOnReady?: boolean;
  onReady?: (result: CameraReadinessResult) => void;
  onStatusChange?: (status: CameraReadinessResult['status']) => void;
}

export function useCameraReadiness({
  exercise,
  side = null,
  stableMs = 1000,
  enabled = true,
  lockOnReady = true,
  onReady,
  onStatusChange,
}: UseCameraReadinessOptions) {
  const readinessRef = useRef<CameraReadiness | null>(null);
  const prevReadyRef = useRef(false);
  const lockedReadyRef = useRef<CameraReadinessResult | null>(null);
  const prevStatusRef = useRef<CameraReadinessResult['status'] | null>(null);

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  const [result, setResult] = useState<CameraReadinessResult | null>(null);
  const [latestFrame, setLatestFrame] = useState<PoseFrame | null>(null);

  const resolvedExercise = useMemo(
    () => (READINESS_PROFILES[exercise] ? exercise : 'pushup'),
    [exercise]
  );

  // 운동이나 side가 변경되면 새 인스턴스 생성
  useEffect(() => {
    if (!enabled) {
      readinessRef.current = null;
      prevReadyRef.current = false;
      lockedReadyRef.current = null;
      prevStatusRef.current = null;
      setResult(null);
      setLatestFrame(null);
      return;
    }

    try {
      readinessRef.current = new CameraReadiness({
        exercise: resolvedExercise,
        side,
        stableMs,
      });
    } catch {
      readinessRef.current = new CameraReadiness({
        exercise: 'pushup',
        side,
        stableMs,
      });
    }
    prevReadyRef.current = false;
    lockedReadyRef.current = null;
    prevStatusRef.current = null;
    setResult(null);
    setLatestFrame(null);
  }, [resolvedExercise, side, stableMs, enabled]);

  const pushFrame = useCallback(
    (frame: PoseFrame) => {
      if (!readinessRef.current || !enabled) return null;

      setLatestFrame(frame);

      if (lockOnReady && lockedReadyRef.current) {
        return lockedReadyRef.current;
      }

      const current = readinessRef.current.pushFrame(frame);
      setResult(current);

      if (current.status !== prevStatusRef.current) {
        prevStatusRef.current = current.status;
        onStatusChangeRef.current?.(current.status);
      }

      // Edge-triggered: ready가 false -> true로 변경되는 단 한 번의 순간
      if (!prevReadyRef.current && current.ready) {
        prevReadyRef.current = true;
        if (lockOnReady) {
          lockedReadyRef.current = current;
        }
        onReadyRef.current?.(current);
      } else if (prevReadyRef.current && !current.ready && !lockOnReady) {
        prevReadyRef.current = false;
      }

      return current;
    },
    [enabled, lockOnReady]
  );

  const breakContinuity = useCallback((reason = 'pause') => {
    readinessRef.current?.breakContinuity(reason);
    prevReadyRef.current = false;
    lockedReadyRef.current = null;
    setResult(prev => (prev ? { ...prev, ready: false, stableForMs: 0, status: 'adjust_camera' } : null));
  }, []);

  const reset = useCallback(() => {
    readinessRef.current?.reset();
    prevReadyRef.current = false;
    lockedReadyRef.current = null;
    prevStatusRef.current = null;
    setResult(null);
    setLatestFrame(null);
  }, []);

  return useMemo(() => {
    const profile = READINESS_PROFILES[resolvedExercise] ?? READINESS_PROFILES.pushup;
    const status = result?.status ?? 'no_person';
    const isReady = result?.ready ?? false;
    const isObservable = result?.observable ?? false;
    const selectedSide = result?.selectedSide ?? null;
    const candidateSide = result?.candidateSide ?? null;
    const activeSide: 'left' | 'right' | 'both' | null =
      selectedSide ?? candidateSide ?? (profile.mode === 'both' ? 'both' : side);

    const missingLandmarks = result?.missingLandmarks ?? [];
    const outOfFrameLandmarks = result?.outOfFrameLandmarks ?? [];

    let evaluatedSides: ('left' | 'right')[];
    if (profile.mode === 'both' || activeSide === 'both') {
      evaluatedSides = ['left', 'right'];
    } else if (activeSide === 'left' || activeSide === 'right') {
      evaluatedSides = [activeSide];
    } else {
      const hasRightIssue = [...missingLandmarks, ...outOfFrameLandmarks].some(k =>
        k.startsWith('right_')
      );
      evaluatedSides = [hasRightIssue ? 'right' : 'left'];
    }

    const missingSet = new Set(missingLandmarks);
    const outOfFrameSet = new Set(outOfFrameLandmarks);
    const requiredJointNames = new Set(profile.joints);

    const jointStates: Record<string, JointRecognitionState> = {};
    let requiredJointCount = 0;
    let recognizedJointCount = 0;

    for (const s of ['left', 'right'] as const) {
      const sideActive = evaluatedSides.includes(s);
      for (const j of ALL_SILHOUETTE_JOINTS) {
        const key = `${s}_${j}`;
        if (!sideActive || !requiredJointNames.has(j)) {
          jointStates[key] = 'inactive';
          continue;
        }
        requiredJointCount += 1;
        if (!result || status === 'no_person') {
          jointStates[key] = 'missing';
        } else if (outOfFrameSet.has(key)) {
          jointStates[key] = 'out_of_frame';
        } else if (missingSet.has(key)) {
          jointStates[key] = 'missing';
        } else {
          jointStates[key] = 'recognized';
          recognizedJointCount += 1;
        }
      }
    }

    const stableForMs = result?.stableForMs ?? 0;
    const stabilityProgress = isReady
      ? 1
      : Math.min(1, Math.max(0, stableForMs / Math.max(1, stableMs)));

    let detailMessage: string;
    if (isReady) {
      detailMessage = `주요 신체 점(${requiredJointCount}/${requiredJointCount}) 인식 완료! 운동을 시작합니다.`;
    } else if (status === 'stabilizing') {
      detailMessage = `주요 신체 점 ${recognizedJointCount}/${requiredJointCount} 인식됨 · 자세 유지 중 (${Math.round(
        stabilityProgress * 100
      )}%)`;
    } else if (outOfFrameLandmarks.length > 0) {
      const names = formatJointListKo(outOfFrameLandmarks);
      detailMessage = `화면 밖 신체 점: ${names.join(', ')} (${recognizedJointCount}/${requiredJointCount} 인식)`;
    } else if (missingLandmarks.length > 0) {
      const names = formatJointListKo(missingLandmarks);
      detailMessage = `인식 대기 신체 점: ${names.join(', ')} (${recognizedJointCount}/${requiredJointCount} 인식)`;
    } else {
      detailMessage = `주요 신체 점 0/${requiredJointCount} 인식 · 영역 안에 전신이 보이게 서주세요`;
    }

    return {
      pushFrame,
      breakContinuity,
      reset,
      result,
      latestFrame,
      status,
      isReady,
      isObservable,
      message: result?.message ?? '카메라에 전신이 나오도록 위치해주세요.',
      detailMessage,
      reasonCode: result?.reasonCode ?? null,
      missingLandmarks,
      outOfFrameLandmarks,
      stableForMs,
      stabilityProgress,
      selectedSide,
      candidateSide,
      activeSide,
      jointStates,
      recognizedJointCount,
      requiredJointCount,
    };
  }, [pushFrame, breakContinuity, reset, result, latestFrame, resolvedExercise, side, stableMs]);
}
