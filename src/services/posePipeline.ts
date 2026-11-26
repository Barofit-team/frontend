import {
  BirdDogAnalyzer,
  BulgarianSplitSquatAnalyzer,
  BurpeeAnalyzer,
  DeadBugAnalyzer,
  ExerciseSessionController,
  FlutterKicksAnalyzer,
  GluteBridgeAnalyzer,
  InclinePushupAnalyzer,
  JumpingJackAnalyzer,
  JumpSquatAnalyzer,
  LegRaiseAnalyzer,
  LungeAnalyzer,
  MountainClimberAnalyzer,
  PikePushupAnalyzer,
  PlankAnalyzer,
  PushupAnalyzer,
  ReverseCrunchAnalyzer,
  SidePlankAnalyzer,
  SideLegRaiseAnalyzer,
  SplitSquatAnalyzer,
  SitupAnalyzer,
  SquatAnalyzer,
  StandingCalfRaiseAnalyzer,
  SupermanAnalyzer,
  type PoseFrame,
  type SessionState,
} from '@barofit/pose';
import type { PoseFrameResult } from '@/services/poseCoaching';
import { createPoseCoach } from '@/services/poseCoaching';
import { flushWorkoutQueue, commitPoseSet } from '@/services/offlineWorkout';
import { poseSupportForSnapshot } from '@/services/poseExerciseIds';
import type { CoachingEvent } from '@/types/tts';
import { devLog } from '@/utils/devLog';

type Completed = Record<string, unknown> & { schemaVersion: string; type: string; exercise: string };
export interface PoseAnalyzer {
  pushFrame(frame: unknown): PoseFrameResult;
  breakContinuity(reason: 'pause'): unknown;
  finish(): Completed[];
}

/**
 * Routine exerciseId + 진행 세션 snapshot의 measurementType → 분석기. 입력은 Routine ID만 받는다(AI ID·미확인 ID를 그대로 통과시키지 않음).
 *  - supported: 명시 매핑된 분석기 생성 (마운틴 클라이머·실험 카운터 5종은 REPS, 사이드 플랭크는 DURATION snapshot만)
 *  - conflict(V13 이전 DURATION 마운틴 클라이머·V15 이전 DURATION 플러터킥, 측정 유형 누락·잘못된 값): 잘못된 단위의 결과를 만들지 않도록
 *    분석기를 연결하지 않고 기존 M10 미지원 경로(측정 없이 진행 → 기존 안내 후 정지, 재시도 없음)를 쓴다. 다른 분석기로 대체하지 않음
 *  - incomplete·not_implemented·unknown: null (기존 M10 미지원 경로)
 */
export function createExerciseAnalyzer(routineExerciseId: string, measurementType: unknown): PoseAnalyzer | null {
  const support = poseSupportForSnapshot(routineExerciseId, measurementType);
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
    case 'side_plank': // supported(DURATION snapshot)일 때만 도달. REPS·누락·잘못된 측정 유형은 conflict로 위에서 null
      return new SidePlankAnalyzer() as unknown as PoseAnalyzer;
    // 05: 실험 횟수 카운터(REPS snapshot일 때만 도달). 측면은 AI 자동 선택(옵션 없음)
    case 'jump_squat':
      return new JumpSquatAnalyzer() as unknown as PoseAnalyzer;
    case 'reverse_crunch':
      return new ReverseCrunchAnalyzer() as unknown as PoseAnalyzer;
    case 'burpee':
      return new BurpeeAnalyzer() as unknown as PoseAnalyzer;
    case 'situp':
      return new SitupAnalyzer() as unknown as PoseAnalyzer;
    case 'flutter_kicks': // 양쪽 다리를 함께 관측(측면 옵션 없음)
      return new FlutterKicksAnalyzer() as unknown as PoseAnalyzer;
    default:
      return null;
  }
}
/**
 * 한 세트 = Controller 1개 + 분석기 1개 + 결과 ID 1개. 분석기는 Controller만 호출한다(FE에서 직접 pushFrame하지 않음 → 프레임당 측정 1회).
 * Controller(ExerciseSessionController)가 관측·이탈(2초)·재인식 안정화·5초 복귀·측정 차단의 단일 판정 주체다.
 * 일시정지·복귀 중에도 카메라 프레임은 계속 pushFrame으로 전달한다(측정은 Controller가 active일 때만).
 */
export function createPosePipeline(options: {
  analyzer: PoseAnalyzer; owner: string; sessionId: string; routineSetId: string; resultId: string;
  isOwner: () => boolean; sendCoach: (event: CoachingEvent) => boolean; speak: (text: string) => void;
}) {
  const coach = createPoseCoach(options.sendCoach, options.speak);
  const controller = new ExerciseSessionController({
    analyzer: options.analyzer as unknown as ConstructorParameters<typeof ExerciseSessionController>[0]['analyzer'],
  });
  let result: Completed | null = null;
  let performedAt: string | null = null;
  let lastLoggedCount = 0;
  return {
    /** frame.timestampMs는 sessionNow() 시간축이어야 한다(watchdog tick과 같은 축) */
    pushFrame(frame: PoseFrame): SessionState {
      if (result) throw new Error('종료된 세트입니다.');
      const state = controller.pushFrame(frame);
      if (state.frameResult) {
        const fr = state.frameResult as unknown as PoseFrameResult;
        coach.process(fr);
        if (!fr.ignored && typeof fr.count === 'number' && fr.count > lastLoggedCount) {
          lastLoggedCount = fr.count;
          const codes = fr.lastRepetition?.number === fr.count ? fr.lastRepetition.codes : fr.currentCodes;
          devLog('Pose', `${fr.exercise} ${fr.count}회`, {
            codes,
            ...(fr.side ? { side: fr.side } : {}),
          });
        }
      }
      return state;
    },
    /** 카메라 콜백이 멈춘 경우까지 감지하는 watchdog. 분석기 프레임을 합성하지 않는다 */
    tick(nowMs: number): SessionState { return controller.tick(nowMs); },
    pause(): SessionState { return controller.pause(); },
    /** 수동 일시정지 해제. Controller는 재인식 안정화 → 5초 countdown → active 순서로만 측정을 재개한다 */
    resume(): SessionState { return controller.resume(); },
    state(): SessionState { return controller.getState(); },
    async finish() {
      if (!result) {
        result = (controller.finish() as Completed[]).find(event => event.type === 'set.completed') ?? null;
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
