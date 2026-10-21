export type Gender = 'MALE' | 'FEMALE';

export type WorkoutGoal =
  | 'WEIGHT_LOSS'
  | 'MUSCLE_GAIN'
  | 'ENDURANCE'
  | 'POSTURE_CORRECTION';

export type WeeklyFrequency = 2 | 3 | 4 | 5 | 6;

export type WorkoutExperience =
  | 'NEWBIE'
  | 'BEGINNER'
  | 'INTERMEDIATE'
  | 'ADVANCED';

export type DiscomfortArea =
  | 'NONE'
  | 'NECK_SHOULDER'
  | 'ARM_WRIST'
  | 'BACK_WAIST'
  | 'LEG_ANKLE';

/**
 * 피그마 온보딩 Step 7 코칭 스타일
 * 백엔드/마스터 컨텍스트의 3대 페르소나(gentle / spartan / analytical)와 매핑 가능
 */
export type CoachingStyle =
  | 'FRIENDLY'
  | 'CALM'
  | 'SPARTAN'
  | 'ANALYTICAL';

export type PersonaTone = 'gentle' | 'spartan' | 'analytical';

export interface OnboardingProfile {
  nickname: string;
  gender: Gender;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  goal: WorkoutGoal | null;
  weeklyFrequency: WeeklyFrequency | null;
  experience: WorkoutExperience | null;
  discomfortAreas: DiscomfortArea[];
  coachingStyle: CoachingStyle | null;
}

export const COACHING_STYLE_TO_PERSONA: Record<CoachingStyle, PersonaTone> = {
  FRIENDLY: 'gentle',
  CALM: 'gentle',
  SPARTAN: 'spartan',
  ANALYTICAL: 'analytical',
};
