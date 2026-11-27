import { useAuthStore } from '@/stores/useAuthStore';
import { flushWorkoutQueue, hasCompletedWorkout, isOffline } from '@/services/offlineWorkout';
import { getDailyWorkoutState } from '@/services/workoutSessionService';

export const DAILY_DONE_MESSAGE = '오늘의 루틴을 이미 완료했어요. 다음 운동은 내일 시작할 수 있어요.';

/** Fail closed for a new session if the server's daily completion cannot be checked. */
export async function assertDailyWorkoutAvailable(owner: string, date: string, currentSessionId?: string) {
  if (await hasCompletedWorkout(owner, date)) throw new Error(DAILY_DONE_MESSAGE);
  const isOwner = () => useAuthStore.getState().user?.id === owner;
  try {
    await flushWorkoutQueue(owner, isOwner);
    const state = await getDailyWorkoutState();
    if (!isOwner()) throw new Error('로그인 계정이 변경됐어요.');
    if (state.date !== date) throw new Error('날짜가 변경됐어요. 홈에서 오늘의 루틴을 다시 선택해 주세요.');
    if (state.completed) throw new Error(DAILY_DONE_MESSAGE);
    if (state.activeSessionId && state.activeSessionId !== currentSessionId)
      throw new Error('다른 기기 또는 화면에서 진행 중인 운동을 먼저 종료해 주세요.');
  } catch (error) {
    // An already persisted session can resume offline; a new one requires server validation.
    if (currentSessionId && isOwner() && isOffline(error)) return;
    throw error;
  }
}
