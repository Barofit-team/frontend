/** Exact routine catalog ID → Barofit Pose exercise ID. Never infer unsupported variants. */
export const POSE_EXERCISE_IDS = {
  'push-up': 'pushup',
  'plank': 'plank',
  'squat': 'squat',
  'bird-dog': 'bird_dog',
  'jumping-jack': 'jumping_jack',
  'leg-raise': 'leg_raise',
  'glute-bridge': 'glute_bridge',
  'pike-push-up': 'pike_pushup',
  'superman': 'superman',
  'mountain-climber': 'mountain_climber',
  'lunge': 'lunge',
  'split-squat': 'split_squat',
  'bulgarian-split-squat': 'bulgarian_split_squat',
  'incline-push-up': 'incline_pushup',
  'side-lying-leg-raise': 'side_lying_leg_raise',
  'standing-calf-raise': 'standing_calf_raise',
  'dead-bug': 'dead_bug',
  'side-plank': 'side_plank',
  // 05: Pose 실험 횟수 카운터(five-exercise-pilot-0.1, items.form unknown·compliancePct null). 자세 평가기가 아님
  'jump-squat': 'jump_squat',
  'reverse-crunch': 'reverse_crunch',
  'burpee': 'burpee',
  'sit-up': 'situp',
} as const;

export function poseExerciseId(routineExerciseId: string): string | null {
  return Object.prototype.hasOwnProperty.call(POSE_EXERCISE_IDS, routineExerciseId)
    ? POSE_EXERCISE_IDS[routineExerciseId as keyof typeof POSE_EXERCISE_IDS] : null;
}

/**
 * 23종 Routine exerciseId의 모바일 AI 분석기 지원 상태. Routine assessmentStatus는 입력으로 쓰지 않는다.
 *  - supported: FE에서 기술적으로 연결 가능 (제품 출시 가능·실기기 검증 완료를 뜻하지 않음.
 *    글루트 브리지 PD 측정 유형, 버드독·수퍼맨 보조 측정값, 실험 분석기 검증 상태는 별도 미해결)
 *  - conflict: 정적 상태로는 쓰지 않는다. snapshot 측정 유형이 분석기 계약과 다를 때 poseSupportForSnapshot이 반환
 *  - incomplete: JS 분석기·FE 매핑은 있으나 readiness·FE 연동 미완성 (현재 해당 종목 없음.
 *    사이드 플랭크는 Pose 49762dd READINESS_PROFILES.side_plank로 supported, DURATION 계약은 REQUIRED_MEASUREMENT)
 *  - not_implemented: 현재 앱 의존성에 JS 분석기 없음
 *  - unknown: 23종에 없는 ID (유사한 이름도 다른 분석기에 연결하지 않음)
 */
export type PoseSupportStatus = 'supported' | 'conflict' | 'incomplete' | 'not_implemented' | 'unknown';
export interface PoseSupport { status: PoseSupportStatus; poseId: string | null }

const SPECIAL_SUPPORT: Readonly<Record<string, PoseSupport>> = {
  // 플러터킥: AI FlutterKicksAnalyzer는 REPS(count, holdSeconds null)인데 Routine은 DURATION → Routine 계약 변경(06) 전까지 연결하지 않음
  'flutter-kick': { status: 'not_implemented', poseId: null },
};

export function poseSupport(routineExerciseId: string): PoseSupport {
  if (Object.prototype.hasOwnProperty.call(SPECIAL_SUPPORT, routineExerciseId)) {
    return { ...SPECIAL_SUPPORT[routineExerciseId] };
  }
  const poseId = poseExerciseId(routineExerciseId);
  return poseId ? { status: 'supported', poseId } : { status: 'unknown', poseId: null };
}

/**
 * 분석기 주 측정값에 맞는 Routine 측정 유형이 정해진 종목. 정적 ID 지원(poseSupport)과 별개로 실제 snapshot 계약을 검증한다.
 *  - 마운틴 클라이머: AI count(한쪽 무릎 왕복 1회, 좌우 한 쌍 2회) ↔ Routine V13 REPS.
 *    V13 이전 DURATION snapshot(이미 시작된 세션·checkpoint)은 conflict로 유지하고 REPS로 바꾸거나 시간 목표를 횟수로 변환하지 않는다
 * 여기 없는 종목은 기존과 같이 snapshot 측정 유형으로 주 측정값을 고른다(commitPoseSet).
 */
const REQUIRED_MEASUREMENT: Readonly<Record<string, 'REPS' | 'DURATION'>> = {
  'mountain-climber': 'REPS',
  // 사이드 플랭크: AI holdSeconds(좌우 정상 유지 합계, count null) ↔ Routine DURATION. REPS·누락·잘못된 값은 conflict
  'side-plank': 'DURATION',
  // 05: 실험 카운터 4종은 AI count만 제공(holdSeconds null) ↔ Routine V5 REPS. DURATION·누락·잘못된 값은 conflict
  'jump-squat': 'REPS',
  'reverse-crunch': 'REPS',
  'burpee': 'REPS',
  'sit-up': 'REPS',
};

/**
 * 실제 snapshot 종목의 지원 상태. 분석기 생성·결과 저장·준비 화면은 이 함수를 쓴다.
 * 정적 supported라도 계약 측정 유형이 정해진 종목은 snapshot 측정 유형이 같을 때만 supported이고,
 * 다르거나 누락·잘못된 값이면 conflict(분석기 미연결 → 기존 M10 미지원 경로, 결과 저장 차단)다.
 */
export function poseSupportForSnapshot(routineExerciseId: string, measurementType: unknown): PoseSupport {
  const support = poseSupport(routineExerciseId);
  if (support.status !== 'supported') return support;
  if (Object.prototype.hasOwnProperty.call(REQUIRED_MEASUREMENT, routineExerciseId) &&
      REQUIRED_MEASUREMENT[routineExerciseId] !== measurementType) {
    return { status: 'conflict', poseId: support.poseId };
  }
  return support;
}

/**
 * 준비 화면 readiness 가능 여부. 프로필 원본은 AI READINESS_PROFILES이며 FE는 복사하지 않는다(hasProfile로 조회).
 * 해당 운동 프로필이 없으면 다른 운동 프로필로 대체하지 않는다(poseId null → readiness 미실행).
 */
export type ReadinessAvailability = 'available' | 'profile_unsupported' | 'analyzer_unsupported' | 'contract_conflict';

export function readinessAvailability(
  routineExerciseId: string | undefined,
  hasProfile: (poseId: string) => boolean,
  measurementType: unknown,
): { availability: ReadinessAvailability; poseId: string | null } {
  const support = routineExerciseId ? poseSupportForSnapshot(routineExerciseId, measurementType)
    : { status: 'unknown' as const, poseId: null };
  if (support.status === 'not_implemented' || support.status === 'unknown' || !support.poseId) {
    return { availability: 'analyzer_unsupported', poseId: null };
  }
  if (!hasProfile(support.poseId)) return { availability: 'profile_unsupported', poseId: null };
  if (support.status === 'incomplete') return { availability: 'profile_unsupported', poseId: null };
  // conflict(측정 유형 불일치 snapshot): 준비 자세 관찰은 AI 프로필로 가능(진입 유지). 세션에서는 분석기를 연결하지 않는다
  return { availability: support.status === 'conflict' ? 'contract_conflict' : 'available', poseId: support.poseId };
}

/**
 * 사용자 몸 촬영 방향(정면/측면). 스마트폰 전면·후면 카메라 선택, AI readiness의 either/both 관절 조건과 별개다.
 * 근거가 확인된 종목만 정의하고 그 외는 미확정(null)이며 기본값을 두지 않는다.
 *  - 스쿼트·플랭크: PD 운동 세션 구상도(측면)
 *  - 점핑잭(정면)·레그 레이즈(측면)·파이크 푸시업(측면): AI팀 기술 문서(JUMPING_JACK_V01, LEG_RAISE_V01, PIKE_PUSHUP_V01)
 *  - 인클라인 푸시업(측면): AI팀 분석 프로토타입 촬영 안내(analysis/incline_pushup "측면에서 전신이 보이게 촬영")
 *  - 버드독(측면): AI팀 기술 문서(BIRD_DOG "측면에 가까운 고정 카메라"). 정확한 촬영 각도는 실기기 검증 항목
 *  - 수퍼맨(측면): AI팀 기술 문서(SUPERMAN_V01 "측면 또는 측면에 가까운 사선 촬영")
 *  - 런지(측면): AI팀 분석 프로토타입(analysis/lunge "측면 전신 영상용", "측면·단독 인물 전제")
 *  - 글루트 브리지(측면): AI팀 기술 문서(GLUTE_BRIDGE "측면·전신 촬영")
 *  - 마운틴 클라이머(측면): AI팀 기술 문서(MOUNTAIN_CLIMBER_V01 "전신 측면에서", 정면 구도 클립은 0회 보류)
 *  - 점프 스쿼트·리버스 크런치·싯업(측면): AI팀 기술 문서(FIVE_EXERCISE_RUNTIME "측면·사선"). 수퍼맨과 같이 측면으로 둔다
 *  - 버피(측면): AI팀 기술 문서(FIVE_EXERCISE_RUNTIME "전신 측면. 정면 미지원")
 */
export type BodyView = 'front' | 'side';
const BODY_VIEWS: Readonly<Record<string, BodyView>> = {
  'squat': 'side',
  'plank': 'side',
  'jumping-jack': 'front',
  'leg-raise': 'side',
  'pike-push-up': 'side',
  'incline-push-up': 'side',
  'bird-dog': 'side',
  'superman': 'side',
  'lunge': 'side',
  'glute-bridge': 'side',
  'mountain-climber': 'side',
  'jump-squat': 'side',
  'reverse-crunch': 'side',
  'burpee': 'side',
  'sit-up': 'side',
};

export function poseBodyView(routineExerciseId: string): BodyView | null {
  return Object.prototype.hasOwnProperty.call(BODY_VIEWS, routineExerciseId) ? BODY_VIEWS[routineExerciseId] : null;
}
