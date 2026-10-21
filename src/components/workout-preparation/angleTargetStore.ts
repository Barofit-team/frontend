/**
 * 기술 검증용 목표 각도 (앱 실행 중에만 유지, 저장하지 않음).
 * 개발 모드에서 "현재 각도를 목표로"로 지정합니다. 서비스 기준 각도가 아닙니다.
 */
import { create } from 'zustand';

import { ANGLE_CONFIG } from './angleConfig';

interface AngleTargetState {
  targetDeg: number | null;
  setTargetDeg: (deg: number | null) => void;
}

export const useAngleTargetStore = create<AngleTargetState>(set => ({
  targetDeg: ANGLE_CONFIG.defaultTargetDeg,
  setTargetDeg: deg => set({ targetDeg: deg }),
}));
