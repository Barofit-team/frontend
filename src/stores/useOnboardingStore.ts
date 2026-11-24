import { create } from 'zustand';
import { ageFromBirthDate } from '@/utils/birthDate';

import {
  COACHING_STYLE_TO_PERSONA,
  type CoachingStyle,
  type DiscomfortArea,
  type DiscomfortSelection,
  type ExerciseGoal,
  type ExperienceLevel,
  type Gender,
  type OnboardingProfile,
  type OnboardingRequest,
  type PersonaTone,
  type WeeklyWorkoutDays,
} from '@/types/onboarding';

export const TOTAL_ONBOARDING_STEPS = 8;

interface OnboardingState extends OnboardingProfile {
  step: number;
  ageInput: string;
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  setBirthDatePart: (part: 'birthYear' | 'birthMonth' | 'birthDay', value: string) => void;
  heightInput: string;
  weightInput: string;
  persona: PersonaTone;

  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  setNickname: (nickname: string) => void;
  setGender: (gender: Gender) => void;
  toggleGender: () => void;
  setAgeInput: (value: string) => void;
  setHeightInput: (value: string) => void;
  setWeightInput: (value: string) => void;
  setGoal: (goal: ExerciseGoal) => void;
  setWeeklyWorkoutDays: (days: WeeklyWorkoutDays) => void;
  setExperienceLevel: (level: ExperienceLevel) => void;
  toggleDiscomfortSelection: (selection: DiscomfortSelection) => void;
  setDiscomfortSelections: (selections: DiscomfortSelection[]) => void;
  setCoachingStyle: (style: CoachingStyle) => void;
  toOnboardingRequest: () => OnboardingRequest | null;
  resetOnboarding: () => void;
}

const initialProfileState = {
  step: 1,
  nickname: '',
  gender: null as Gender | null,
  age: null as number | null,
  heightCm: null as number | null,
  weightKg: null as number | null,
  ageInput: '',
  birthYear: '',
  birthMonth: '',
  birthDay: '',
  heightInput: '',
  weightInput: '',
  goal: null as ExerciseGoal | null,
  weeklyWorkoutDays: null as WeeklyWorkoutDays | null,
  experienceLevel: null as ExperienceLevel | null,
  discomfortSelections: [] as DiscomfortSelection[],
  // 성향 선택 화면 보류 중에는 서버 필수값을 기본 친근한 코치로 보낸다.
  coachingStyle: 'FRIENDLY' as CoachingStyle,
  persona: 'gentle' as PersonaTone,
};

function parsePositiveInt(raw: string): { text: string; value: number | null } {
  const text = raw.replace(/[^0-9]/g, '').slice(0, 3);
  if (!text) return { text: '', value: null };
  const num = Number(text);
  return {
    text,
    value: Number.isInteger(num) && num > 0 ? num : null,
  };
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  ...initialProfileState,

  setStep: (step) =>
    set({
      step: Math.max(1, Math.min(TOTAL_ONBOARDING_STEPS, step)),
    }),

  nextStep: () =>
    set((state) => ({
      step: Math.min(TOTAL_ONBOARDING_STEPS, state.step + 1),
    })),

  prevStep: () =>
    set((state) => ({
      step: Math.max(1, state.step - 1),
    })),

  setNickname: (nickname) => set({ nickname }),

  setGender: (gender) => set({ gender }),

  toggleGender: () =>
    set((state) => ({
      gender: state.gender === 'MALE' ? 'FEMALE' : 'MALE',
    })),

  setBirthDatePart: (part, value) => {
    const text = value.replace(/[^0-9]/g, '').slice(0, part === 'birthYear' ? 4 : 2);
    const birth = { birthYear: get().birthYear, birthMonth: get().birthMonth, birthDay: get().birthDay, [part]: text };
    const age = ageFromBirthDate(birth.birthYear, birth.birthMonth, birth.birthDay);
    set({ ...birth, age, ageInput: age === null ? '' : String(age) });
  },

  setAgeInput: (value) => {
    const parsed = parsePositiveInt(value);
    set({ ageInput: parsed.text, age: parsed.value });
  },

  setHeightInput: (value) => {
    const parsed = parsePositiveInt(value);
    set({ heightInput: parsed.text, heightCm: parsed.value });
  },

  setWeightInput: (value) => {
    const parsed = parsePositiveInt(value);
    set({ weightInput: parsed.text, weightKg: parsed.value });
  },

  setGoal: (goal) => set({ goal }),

  setWeeklyWorkoutDays: (weeklyWorkoutDays) => set({ weeklyWorkoutDays }),

  setExperienceLevel: (experienceLevel) => set({ experienceLevel }),

  toggleDiscomfortSelection: (selection) =>
    set((state) => {
      if (selection === 'NONE') {
        const isAlreadyNone =
          state.discomfortSelections.length === 1 &&
          state.discomfortSelections[0] === 'NONE';
        return { discomfortSelections: isAlreadyNone ? [] : ['NONE'] };
      }

      const withoutNone = state.discomfortSelections.filter((item) => item !== 'NONE');
      const exists = withoutNone.includes(selection);
      const nextSelections = exists
        ? withoutNone.filter((item) => item !== selection)
        : [...withoutNone, selection];

      return { discomfortSelections: nextSelections };
    }),

  setDiscomfortSelections: (discomfortSelections) =>
    set({
      discomfortSelections:
        discomfortSelections.length > 0 ? discomfortSelections : ['NONE'],
    }),

  setCoachingStyle: (coachingStyle) =>
    set({
      coachingStyle,
      persona: COACHING_STYLE_TO_PERSONA[coachingStyle],
    }),

  toOnboardingRequest: () => {
    const state = get();
    const trimmedNickname = state.nickname.trim();
    const age = ageFromBirthDate(state.birthYear, state.birthMonth, state.birthDay);
    if (
      !trimmedNickname ||
      !state.gender ||
      age === null || age < 14 || age > 100 ||
      state.heightCm === null ||
      state.weightKg === null ||
      !state.goal ||
      !state.experienceLevel ||
      !state.weeklyWorkoutDays ||
      state.discomfortSelections.length === 0 ||
      !state.coachingStyle
    ) {
      return null;
    }

    const discomfortAreas: DiscomfortArea[] = state.discomfortSelections.filter(
      (item): item is DiscomfortArea => item !== 'NONE',
    );

    return {
      nickname: trimmedNickname,
      gender: state.gender,
      birthDate: `${state.birthYear}-${state.birthMonth.padStart(2, '0')}-${state.birthDay.padStart(2, '0')}`,
      heightCm: state.heightCm,
      weightKg: state.weightKg,
      goal: state.goal,
      experienceLevel: state.experienceLevel,
      weeklyWorkoutDays: state.weeklyWorkoutDays,
      discomfortAreas,
      coachingStyle: state.coachingStyle,
    };
  },

  resetOnboarding: () => set({ ...initialProfileState }),
}));
