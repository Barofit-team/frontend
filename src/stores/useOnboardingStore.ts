import { create } from 'zustand';

import {
  COACHING_STYLE_TO_PERSONA,
  type CoachingStyle,
  type DiscomfortArea,
  type Gender,
  type OnboardingProfile,
  type PersonaTone,
  type WeeklyFrequency,
  type WorkoutExperience,
  type WorkoutGoal,
} from '@/types/onboarding';

export const TOTAL_ONBOARDING_STEPS = 7;

interface OnboardingState extends OnboardingProfile {
  step: number;
  ageInput: string;
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
  setGoal: (goal: WorkoutGoal) => void;
  setWeeklyFrequency: (frequency: WeeklyFrequency) => void;
  setExperience: (experience: WorkoutExperience) => void;
  toggleDiscomfortArea: (area: DiscomfortArea) => void;
  setCoachingStyle: (style: CoachingStyle) => void;
  resetOnboarding: () => void;
}

const initialProfileState = {
  step: 1,
  nickname: '',
  gender: 'MALE' as Gender,
  age: null as number | null,
  heightCm: null as number | null,
  weightKg: null as number | null,
  ageInput: '',
  heightInput: '',
  weightInput: '',
  goal: null as WorkoutGoal | null,
  weeklyFrequency: null as WeeklyFrequency | null,
  experience: null as WorkoutExperience | null,
  discomfortAreas: [] as DiscomfortArea[],
  coachingStyle: null as CoachingStyle | null,
  persona: 'gentle' as PersonaTone,
};

function parsePositiveNumber(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) && num > 0 ? num : null;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
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

  setAgeInput: (value) => {
    const digitsOnly = value.replace(/[^0-9]/g, '');
    set({
      ageInput: digitsOnly,
      age: parsePositiveNumber(digitsOnly),
    });
  },

  setHeightInput: (value) => {
    const cleaned = value.replace(/[^0-9.]/g, '');
    set({
      heightInput: cleaned,
      heightCm: parsePositiveNumber(cleaned),
    });
  },

  setWeightInput: (value) => {
    const cleaned = value.replace(/[^0-9.]/g, '');
    set({
      weightInput: cleaned,
      weightKg: parsePositiveNumber(cleaned),
    });
  },

  setGoal: (goal) => set({ goal }),

  setWeeklyFrequency: (weeklyFrequency) => set({ weeklyFrequency }),

  setExperience: (experience) => set({ experience }),

  toggleDiscomfortArea: (area) =>
    set((state) => {
      if (area === 'NONE') {
        const isAlreadyNone =
          state.discomfortAreas.length === 1 && state.discomfortAreas[0] === 'NONE';
        return { discomfortAreas: isAlreadyNone ? [] : ['NONE'] };
      }

      const withoutNone = state.discomfortAreas.filter((item) => item !== 'NONE');
      const exists = withoutNone.includes(area);
      const nextAreas = exists
        ? withoutNone.filter((item) => item !== area)
        : [...withoutNone, area];

      return { discomfortAreas: nextAreas };
    }),

  setCoachingStyle: (coachingStyle) =>
    set({
      coachingStyle,
      persona: COACHING_STYLE_TO_PERSONA[coachingStyle],
    }),

  resetOnboarding: () => set({ ...initialProfileState }),
}));
