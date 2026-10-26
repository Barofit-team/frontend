import type { WorkoutDayStatus, WorkoutRecordStatus } from '@/types/workoutRecord';

import { RecordColors } from './palette';

export const DAY_STATUS_LABEL: Record<WorkoutDayStatus, string> = {
  completed: '운동 완료',
  partial: '일부 완료',
  missed: '미실행',
  planned: '운동 예정',
};

export const RECORD_STATUS_STYLE: Record<WorkoutRecordStatus, { label: string; color: string }> = {
  completed: { label: '운동 완료', color: RecordColors.completed },
  partial: { label: '일부 완료', color: RecordColors.partial },
  missed: { label: '미실행', color: RecordColors.missed },
};
