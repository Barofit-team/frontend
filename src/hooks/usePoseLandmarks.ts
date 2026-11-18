import type { Landmark, PoseFrame } from '@barofit/pose';
import { useCallback, useMemo, useRef, useState } from 'react';

export interface PoseFrameMeta {
  frameId: number;
  inferenceMs: number;
}

export interface UsePoseLandmarksOptions {
  /** 추출된 관절 프레임을 소비할 외부 콜백 (예: CameraReadiness.pushFrame, PosePipeline.pushFrame) */
  onFrame?: (frame: PoseFrame, meta: PoseFrameMeta) => void;
}

/**
 * 네이티브 카메라/MediaPipe 추출기로부터 전달되는 33개 관절 좌표(PoseFrame)를
 * 단독으로 수신·관리하고 하위 판정기(준비도·운동 분석기)로 전달하는 독립 훅.
 */
export function usePoseLandmarks({ onFrame }: UsePoseLandmarksOptions = {}) {
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const [frame, setFrame] = useState<PoseFrame | null>(null);
  const [meta, setMeta] = useState<PoseFrameMeta>({ frameId: 0, inferenceMs: 0 });

  const handlePoseFrame = useCallback((nextFrame: PoseFrame, nextMeta: PoseFrameMeta = { frameId: 0, inferenceMs: 0 }) => {
    setFrame(nextFrame);
    setMeta(nextMeta);
    onFrameRef.current?.(nextFrame, nextMeta);
  }, []);

  const reset = useCallback(() => {
    setFrame(null);
    setMeta({ frameId: 0, inferenceMs: 0 });
  }, []);

  return useMemo(() => {
    const landmarks: Landmark[] = frame?.landmarks ?? [];
    return {
      frame,
      landmarks,
      hasPerson: landmarks.length === 33,
      meta,
      handlePoseFrame,
      reset,
    };
  }, [frame, meta, handlePoseFrame, reset]);
}
