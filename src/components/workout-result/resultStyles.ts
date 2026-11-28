/**
 * 운동 결과·피드백 화면(F01~F03) 공용 스타일 (Figma 흑백 시안 기준).
 * 흰 배경 · 검정 텍스트 · 연회색 카드 · 둥근 모서리. 색상은 운동 화면 팔레트(PrepColors)를 그대로 씁니다.
 */
import { StyleSheet } from 'react-native';

import { PrepColors } from '@/components/workout-preparation/palette';

/** 화면 좌우 여백 */
export const RESULT_SCREEN_PADDING = 16;

export const resultStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F6FC' },
  pageTitle: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.4,
  },
  /** 시안 기준 흰색 둥근 카드 (모서리 16, 연한 블루그레이 테두리 + 그림자) */
  card: {
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE4F2',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 1,
  },
  cardTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    color: PrepColors.text,
    letterSpacing: -0.3,
  },
  cardBody: {
    fontSize: 12,
    lineHeight: 18,
    color: PrepColors.textSecondary,
    letterSpacing: -0.2,
  },
  /** "잘한 점", "개선점" 같은 줄 앞 라벨 (시안: 본문과 같은 회색, 살짝 굵게) */
  cardLabel: { fontWeight: '600' },
});
