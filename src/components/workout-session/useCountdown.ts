/**
 * 초 단위 카운트다운 훅.
 *
 *  - 마운트 시점부터 durationSeconds → 0으로 감소합니다. 0 아래로 내려가지 않습니다.
 *  - 남은 시간은 종료 시각(endAt) 기준으로 계산합니다. 1초씩 빼는 방식이 아니어서
 *    렌더 지연이나 JS 스레드 정체가 있어도 오차가 누적되지 않습니다.
 *  - 0초에 도달하면 onComplete를 마운트당 한 번만 호출합니다.
 *  - paused=true 동안은 시간이 흐르지 않고, false가 되면 남은 시간(ms)부터 이어서 진행합니다.
 *    (같은 인스턴스를 유지하므로 일시 정지·재개로 타이머가 초기화되거나 중복 실행되지 않습니다)
 */
import { useEffect, useRef, useState } from 'react';

/** 표시 갱신 주기. 1초보다 짧게 확인해 초 경계를 놓치지 않습니다 */
const TICK_MS = 250;

type UseCountdownOptions = {
  durationSeconds: number;
  /** 0초 도달 시 한 번 호출 */
  onComplete: () => void;
  /** true면 시간 정지 */
  paused?: boolean;
};

/** 남은 시간(초)을 반환합니다 */
export function useCountdown({ durationSeconds, onComplete, paused = false }: UseCountdownOptions): number {
  const [remainingSeconds, setRemainingSeconds] = useState(durationSeconds);
  /** 다음 실행 구간이 시작할 때의 남은 시간. 일시 정지 시점에 갱신 */
  const remainingMsRef = useRef(durationSeconds * 1000);
  const completedRef = useRef(false);

  // 최신 콜백을 유지해, 콜백이 바뀌어도 타이머를 다시 시작하지 않음
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (paused || completedRef.current) return;
    const endAt = Date.now() + remainingMsRef.current;
    let finished = false;

    const intervalId = setInterval(() => {
      if (finished) return;
      const leftMs = Math.max(0, endAt - Date.now());
      setRemainingSeconds(Math.ceil(leftMs / 1000));
      if (leftMs === 0) {
        finished = true;
        completedRef.current = true;
        remainingMsRef.current = 0;
        clearInterval(intervalId);
        onCompleteRef.current();
      }
    }, TICK_MS);

    return () => {
      clearInterval(intervalId);
      // 일시 정지·언마운트 시점의 남은 시간을 보관 → 재개 시 여기서부터
      if (!finished) remainingMsRef.current = Math.max(0, endAt - Date.now());
      finished = true;
    };
  }, [paused]);

  return remainingSeconds;
}
