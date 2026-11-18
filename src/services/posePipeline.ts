import {
  BirdDogAnalyzer,
  BulgarianSplitSquatAnalyzer,
  DeadBugAnalyzer,
  GluteBridgeAnalyzer,
  InclinePushupAnalyzer,
  JumpingJackAnalyzer,
  LegRaiseAnalyzer,
  LungeAnalyzer,
  MountainClimberAnalyzer,
  PikePushupAnalyzer,
  PlankAnalyzer,
  PushupAnalyzer,
  SideLegRaiseAnalyzer,
  SplitSquatAnalyzer,
  SquatAnalyzer,
  StandingCalfRaiseAnalyzer,
  SupermanAnalyzer,
} from '@barofit/pose';
import type { PoseFrameResult } from '@/services/poseCoaching';
import { createPoseCoach } from '@/services/poseCoaching';
import { flushWorkoutQueue, commitPoseSet } from '@/services/offlineWorkout';
import { poseExerciseId } from '@/services/poseExerciseIds';
import type { CoachingEvent } from '@/types/tts';

type Completed = Record<string, unknown> & { schemaVersion: string; type: string; exercise: string };
export interface PoseAnalyzer {
  pushFrame(frame: unknown): PoseFrameResult;
  breakContinuity(reason: 'pause'): unknown;
  finish(): Completed[];
}

export function createExerciseAnalyzer(routineOrPoseId: string): PoseAnalyzer | null {
  const id = poseExerciseId(routineOrPoseId) ?? routineOrPoseId;
  switch (id) {
    case 'pushup':
      return new PushupAnalyzer() as unknown as PoseAnalyzer;
    case 'plank':
      return new PlankAnalyzer() as unknown as PoseAnalyzer;
    case 'squat':
      return new SquatAnalyzer() as unknown as PoseAnalyzer;
    case 'bird_dog':
      return new BirdDogAnalyzer() as unknown as PoseAnalyzer;
    case 'jumping_jack':
      return new JumpingJackAnalyzer() as unknown as PoseAnalyzer;
    case 'leg_raise':
      return new LegRaiseAnalyzer() as unknown as PoseAnalyzer;
    case 'glute_bridge':
      return new GluteBridgeAnalyzer() as unknown as PoseAnalyzer;
    case 'superman':
      return new SupermanAnalyzer() as unknown as PoseAnalyzer;
    case 'pike_pushup':
      return new PikePushupAnalyzer() as unknown as PoseAnalyzer;
    case 'mountain_climber':
      return new MountainClimberAnalyzer() as unknown as PoseAnalyzer;
    case 'lunge':
      return new LungeAnalyzer() as unknown as PoseAnalyzer;
    case 'split_squat':
      return new SplitSquatAnalyzer() as unknown as PoseAnalyzer;
    case 'bulgarian_split_squat':
      return new BulgarianSplitSquatAnalyzer() as unknown as PoseAnalyzer;
    case 'incline_pushup':
      return new InclinePushupAnalyzer() as unknown as PoseAnalyzer;
    case 'standing_calf_raise':
      return new StandingCalfRaiseAnalyzer() as unknown as PoseAnalyzer;
    case 'side_lying_leg_raise':
      return new SideLegRaiseAnalyzer() as unknown as PoseAnalyzer;
    case 'dead_bug':
      return new DeadBugAnalyzer() as unknown as PoseAnalyzer;
    default:
      return null;
  }
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
