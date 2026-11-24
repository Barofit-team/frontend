/**
 * 자동 일시정지 상태 모델 (F04 자동 일시정지 1단계)
 *
 * TRACKING  : 정상 추적 중 (운동 진행)
 * LOST      : 자세 인식 이탈 → 자동 일시정지, 전신 인식 안내
 * RECOVERING: 재인식됨 → 복귀 카운트다운 중 (Figma "복귀 00:05")
 *
 * 순수 함수. 타이머·카메라·화면·서버 상태와 무관하다.
 * 복귀 카운트다운 시간, 이탈 판정 지속 시간 등은 호출 측(2단계)에서 정한다.
 */
import type { TrackingSignal } from '../../services/trackingSignalAdapter';

export type AutoPauseState = 'TRACKING' | 'LOST' | 'RECOVERING';

export type AutoPauseEvent =
  | { type: 'TRACKING_LOST' }
  | { type: 'TRACKING_RECOVERED' }
  | { type: 'RECOVERY_CANCELLED' }
  | { type: 'RECOVERY_COMPLETED' }
  | { type: 'RESET' };

export const INITIAL_AUTO_PAUSE_STATE: AutoPauseState = 'TRACKING';

export interface AutoPauseTransition {
  state: AutoPauseState;
  /** 상태가 실제로 바뀌었는지. false면 호출 측은 아무 동작도 하지 않는다 (중복 이벤트 방지). */
  changed: boolean;
}

function next(state: AutoPauseState, event: AutoPauseEvent): AutoPauseState {
  switch (event.type) {
    case 'RESET':
      return INITIAL_AUTO_PAUSE_STATE;
    case 'TRACKING_LOST':
      // 어느 상태에서든 이탈은 LOST. 복귀 중 이탈도 LOST로 되돌린다.
      return 'LOST';
    case 'TRACKING_RECOVERED':
      return state === 'LOST' ? 'RECOVERING' : state;
    case 'RECOVERY_CANCELLED':
      return state === 'RECOVERING' ? 'LOST' : state;
    case 'RECOVERY_COMPLETED':
      return state === 'RECOVERING' ? 'TRACKING' : state;
  }
}

export function transitionAutoPause(state: AutoPauseState, event: AutoPauseEvent): AutoPauseTransition {
  const nextState = next(state, event);
  return { state: nextState, changed: nextState !== state };
}

export function isAutoPaused(state: AutoPauseState): boolean {
  return state !== 'TRACKING';
}

/**
 * 추적 신호 → 상태 모델 이벤트.
 * - 분석기 미지원: RESET (자동 일시정지 기능 자체를 쓰지 않음. LOST에 갇히지 않게 함)
 * - 카메라 프레임 없음: 이벤트 없음 (이탈로 확정하지 않고, 복귀로도 보지 않음)
 * - user unknown: 이벤트 없음
 */
export function eventFromSignal(signal: TrackingSignal): AutoPauseEvent | null {
  if (signal.analyzer === 'unsupported') return { type: 'RESET' };
  if (signal.camera === 'no_frames') return null;
  if (signal.user === 'lost') return { type: 'TRACKING_LOST' };
  if (signal.user === 'present') return { type: 'TRACKING_RECOVERED' };
  return null;
}
