/**
 * 운동 후 피드백(F02) 선택지.
 *
 * ⚠️ 임시 UI 정책
 *  - 불편 부위 목록은 기획 확정 전 임시값입니다. 변경 시 이 파일만 수정합니다.
 *  - 백엔드 API가 정해지면 id 값을 API 스펙에 맞춰 바꿉니다.
 */
import type { WorkoutDifficulty } from '@/types/workoutResult';

export const DIFFICULTY_OPTIONS: readonly { value: WorkoutDifficulty; label: string }[] = [
  { value: 'easy', label: '쉬웠어요' },
  { value: 'normal', label: '적당했어요' },
  { value: 'hard', label: '어려웠어요' },
];

export const DISCOMFORT_AREA_OPTIONS = [
  { id: 'shoulder', label: '어깨' },
  { id: 'lower-back', label: '허리' },
  { id: 'knee', label: '무릎' },
  { id: 'wrist', label: '손목' },
  { id: 'ankle', label: '발목' },
  { id: 'other', label: '기타' },
] as const;

export type DiscomfortAreaId = (typeof DISCOMFORT_AREA_OPTIONS)[number]['id'];

export function difficultyLabel(value: WorkoutDifficulty): string {
  return DIFFICULTY_OPTIONS.find(option => option.value === value)?.label ?? '';
}

export function discomfortAreaLabel(id: DiscomfortAreaId): string {
  return DISCOMFORT_AREA_OPTIONS.find(option => option.id === id)?.label ?? '';
}
