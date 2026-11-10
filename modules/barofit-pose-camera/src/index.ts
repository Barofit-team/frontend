import type { Landmark, PoseFrame } from '@barofit/pose';
import { requireNativeView } from 'expo';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { ComponentType } from 'react';
import React, { useCallback } from 'react';
import type { NativeSyntheticEvent, StyleProp, ViewProps, ViewStyle } from 'react-native';

export interface PoseEventPayload extends PoseFrame {
  frameId: number;
  inferenceMs: number;
}

export interface PoseErrorPayload {
  code: string;
  message: string;
}

export type NativeCameraStatus =
  | 'starting'
  | 'ready'
  | 'permission_denied'
  | 'stopped'
  | 'error';

export interface CameraStatusPayload {
  status: NativeCameraStatus;
  message?: string;
}

interface NativePoseCameraProps extends ViewProps {
  active?: boolean;
  frontCamera?: boolean;
  style?: StyleProp<ViewStyle>;
  onPose?: (event: NativeSyntheticEvent<PoseEventPayload>) => void;
  onPoseError?: (event: NativeSyntheticEvent<PoseErrorPayload>) => void;
  onCameraStatus?: (event: NativeSyntheticEvent<CameraStatusPayload>) => void;
}

export interface PoseCameraViewProps extends ViewProps {
  active?: boolean;
  frontCamera?: boolean;
  style?: StyleProp<ViewStyle>;
  onPoseFrame?: (frame: PoseFrame, meta: { frameId: number; inferenceMs: number }) => void;
  onPoseError?: (error: PoseErrorPayload) => void;
  onCameraStatus?: (status: CameraStatusPayload) => void;
}

let cachedNativeView: ComponentType<NativePoseCameraProps> | null | undefined;

function getNativePoseCameraView(): ComponentType<NativePoseCameraProps> | null {
  if (cachedNativeView !== undefined) {
    return cachedNativeView;
  }
  try {
    const mod = requireOptionalNativeModule('BarofitPoseCamera');
    if (!mod) {
      cachedNativeView = null;
      return null;
    }
    cachedNativeView = requireNativeView<NativePoseCameraProps>('BarofitPoseCamera');
    return cachedNativeView;
  } catch {
    cachedNativeView = null;
    return null;
  }
}

export function isPoseCameraAvailable(): boolean {
  return getNativePoseCameraView() !== null;
}

/**
 * 순수 MediaPipe 33개 관절 좌표(landmarks) 추출기 + 카메라 프리뷰 컴포넌트.
 * UI 오버레이(스켈레톤·가이드)는 포함하지 않으며 추출된 PoseFrame만 onPoseFrame으로 전달합니다.
 */
export function PoseCameraView({
  active = true,
  frontCamera = true,
  style,
  onPoseFrame,
  onPoseError,
  onCameraStatus,
  ...rest
}: PoseCameraViewProps) {
  const NativeView = getNativePoseCameraView();

  const handlePose = useCallback(
    (event: NativeSyntheticEvent<PoseEventPayload>) => {
      if (!onPoseFrame) return;
      const raw = event.nativeEvent;
      if (!raw || typeof raw.timestampMs !== 'number') return;
      const landmarks: Landmark[] = Array.isArray(raw.landmarks)
        ? raw.landmarks.map((pt) => [
            pt[0] ?? null,
            pt[1] ?? null,
            pt[2] ?? null,
            pt[3] ?? null,
            pt[4] ?? null,
          ])
        : [];
      onPoseFrame(
        {
          timestampMs: raw.timestampMs,
          width: Math.max(1, Math.round(raw.width || 480)),
          height: Math.max(1, Math.round(raw.height || 640)),
          landmarks,
        },
        {
          frameId: raw.frameId ?? 0,
          inferenceMs: raw.inferenceMs ?? 0,
        },
      );
    },
    [onPoseFrame],
  );

  const handlePoseError = useCallback(
    (event: NativeSyntheticEvent<PoseErrorPayload>) => {
      if (!onPoseError || !event.nativeEvent) return;
      onPoseError(event.nativeEvent);
    },
    [onPoseError],
  );

  const handleCameraStatus = useCallback(
    (event: NativeSyntheticEvent<CameraStatusPayload>) => {
      if (!onCameraStatus || !event.nativeEvent) return;
      onCameraStatus(event.nativeEvent);
    },
    [onCameraStatus],
  );

  if (!NativeView) {
    return null;
  }

  return React.createElement(NativeView, {
    ...rest,
    active,
    frontCamera,
    style,
    onPose: handlePose,
    onPoseError: handlePoseError,
    onCameraStatus: handleCameraStatus,
  });
}
