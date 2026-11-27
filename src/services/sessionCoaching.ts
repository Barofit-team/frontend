import type { SessionPhase } from '@/components/workout-session/sessionFlow';

/** Decide announcements from phase boundaries, independently of network completion timing. */
export function phaseAnnouncement(phase: SessionPhase, exercise: { name: string; introTtsText?: string | null }) {
  if (phase.kind === 'countdown' && phase.set === 1) {
    if (phase.exerciseIndex > 0)
      return { type: 'NEXT_EXERCISE', text: `다음 운동은 ${exercise.name}입니다. 휴식 후 준비해 주세요.` };
    if (exercise.introTtsText) return { type: 'EXERCISE_PREPARE', text: exercise.introTtsText };
  }
  if (phase.kind === 'exercising' && phase.set === 1)
    return { type: 'EXERCISE_START', text: `${exercise.name} 운동을 시작할게요.` };
  return null;
}
