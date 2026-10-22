/**
 * useCountdown을 컴포넌트로 감싼 것. 남은 시간을 children 함수로 넘겨 화면을 그립니다.
 *
 * Phase마다 key를 바꿔 렌더링하면, 이전 Phase의 타이머는 언마운트되며 정리되고
 * 새 Phase의 타이머가 처음부터 시작됩니다(타이머 동시 실행 없음).
 * paused 동안 같은 인스턴스가 유지되므로, 재개 시 남은 시간부터 이어집니다.
 */
import type { ReactNode } from 'react';

import { useCountdown } from './useCountdown';

type PhaseTimerProps = {
  durationSeconds: number;
  onComplete: () => void;
  paused?: boolean;
  children: (remainingSeconds: number) => ReactNode;
};

export function PhaseTimer({ durationSeconds, onComplete, paused, children }: PhaseTimerProps) {
  const remainingSeconds = useCountdown({ durationSeconds, onComplete, paused });
  return <>{children(remainingSeconds)}</>;
}
