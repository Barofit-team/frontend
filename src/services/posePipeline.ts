import type { PoseFrameResult } from '@/services/poseCoaching';
import { createPoseCoach } from '@/services/poseCoaching';
import { flushWorkoutQueue, commitPoseSet } from '@/services/offlineWorkout';
import type { CoachingEvent } from '@/types/tts';

type Completed = Record<string, unknown> & { schemaVersion: string; type: string; exercise: string };
export interface PoseAnalyzer {
  pushFrame(frame: unknown): PoseFrameResult;
  breakContinuity(reason: 'pause'): unknown;
  finish(): Completed[];
}
/** One analyzer and one stable result ID for one planned set. Call only after camera frames are available. */
export function createPosePipeline(options: {
  analyzer: PoseAnalyzer; owner: string; sessionId: string; routineSetId: string; resultId: string;
  isOwner: () => boolean; sendCoach: (event: CoachingEvent) => boolean; speak: (text: string) => void;
}) {
  const coach = createPoseCoach(options.sendCoach, options.speak);
  let result: Completed | null = null;
  let performedAt: string | null = null;
  return {
    pushFrame(frame: unknown) {
      if (result) throw new Error('종료된 세트입니다.');
      const output = options.analyzer.pushFrame(frame);
      coach.process(output);
      return output;
    },
    pause() { if (!result) options.analyzer.breakContinuity('pause'); },
    async finish() {
      if (!result) {
        result = options.analyzer.finish().find(event => event.type === 'set.completed') ?? null;
        if (!result) throw new Error('세트 결과를 생성하지 못했습니다.');
        performedAt = new Date().toISOString();
      }
      await commitPoseSet(options.owner, { sessionId: options.sessionId, resultId: options.resultId,
        routineSetId: options.routineSetId, performedAt: performedAt!, payload: result });
      void flushWorkoutQueue(options.owner, options.isOwner).catch(() => {});
      return result;
    },
  };
}
