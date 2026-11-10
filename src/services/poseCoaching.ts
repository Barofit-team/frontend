import type { CoachingEvent } from '@/types/tts';

/** Only map codes whose meaning is supported by the backend coaching catalog. */
const FEEDBACK: Record<string, { code: string; text: string }> = {
  HIP_DROP: { code: 'HIP_DROP', text: '골반이 내려가지 않도록 몸통을 곧게 유지해 주세요.' },
  ELBOW_SHALLOW: { code: 'SHALLOW_RANGE', text: '가능한 범위에서 팔꿈치를 조금 더 굽혀 주세요.' },
  CHEST_RANGE_LOW: { code: 'SHALLOW_RANGE', text: '가능한 범위에서 상체를 조금 더 움직여 주세요.' },
  SQUAT_SHALLOW: { code: 'SHALLOW_RANGE', text: '가능한 범위에서 조금 더 깊게 움직여 주세요.' },
};
export interface PoseFrameResult {
  type: 'frame.result'; exercise: string; ignored: boolean; tracking: string;
  side?: 'left' | 'right' | null;
  count?: number | null;
  holdSeconds?: number | null;
  currentCodes: string[]; lastRepetition: { number: number | null; codes: string[] } | null;
}
/** Ignore unsupported codes and tracking loss; one utterance per interval across all codes. */
export function createPoseCoach(send: (event: CoachingEvent) => boolean, speak: (text: string) => void,
  now: () => number = Date.now, intervalMs = 10000) {
  let lastAt = -Infinity;
  let lastRep: number | null = null;
  return {
    process(frame: PoseFrameResult) {
      if (frame.ignored || frame.tracking !== 'tracking') return;
      const rep = frame.lastRepetition;
      const repCodes = rep && rep.number !== null && rep.number !== lastRep ? rep.codes : [];
      if (rep?.number !== null && rep?.number !== undefined) lastRep = rep.number;
      const match = [...frame.currentCodes, ...repCodes].map(code => FEEDBACK[code]).find(Boolean);
      if (!match || now() - lastAt < intervalMs) return;
      lastAt = now();
      if (!send({ eventType: 'REP_FEEDBACK', exerciseId: frame.exercise, feedbackCode: match.code })) speak(match.text);
    },
  };
}
