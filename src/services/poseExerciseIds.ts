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
} as const;

export function poseExerciseId(routineExerciseId: string): string | null {
  return Object.prototype.hasOwnProperty.call(POSE_EXERCISE_IDS, routineExerciseId)
    ? POSE_EXERCISE_IDS[routineExerciseId as keyof typeof POSE_EXERCISE_IDS] : null;
}
