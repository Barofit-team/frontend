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
import { poseSupport } from '@/services/poseExerciseIds';
import type { CoachingEvent } from '@/types/tts';

type Completed = Record<string, unknown> & { schemaVersion: string; type: string; exercise: string };
export interface PoseAnalyzer {
  pushFrame(frame: unknown): PoseFrameResult;
  breakContinuity(reason: 'pause'): unknown;
  finish(): Completed[];
}

/**
 * Routine exerciseId → 분석기. 입력은 Routine ID만 받는다(AI ID·미확인 ID를 그대로 통과시키지 않음).
 *  - supported: 명시 매핑된 분석기 생성
 *  - conflict(마운틴 클라이머: Routine DURATION ↔ AI count): Routine을 REPS로 통일하는 백엔드 수정 전까지 연결하지 않는다.
 *    잘못된 단위의 결과를 만들지 않도록 기존 M10 미지원 경로(측정 없이 진행 → 기존 안내 후 정지, 재시도 없음)를 쓴다
 *  - incomplete·not_implemented·unknown: null (기존 M10 미지원 경로)
 */
export function createExerciseAnalyzer(routineExerciseId: string): PoseAnalyzer | null {
  const support = poseSupport(routineExerciseId);
  if (support.status !== 'supported') return null;
  switch (support.poseId) {
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
