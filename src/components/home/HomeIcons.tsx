import React from 'react';
import { StyleSheet, View } from 'react-native';

type IconProps = {
  color?: string;
  size?: number;
};

/**
 * 대각선(\) 덤벨 아이콘 — 주간 캘린더 및 루틴 메타 정보용
 */
export function DumbbellIcon({ color = '#111111', size = 16 }: IconProps) {
  const s = size / 16;
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      <View
        style={[
          styles.center,
          {
            width: size,
            height: size,
            transform: [{ rotate: '45deg' }],
          },
        ]}>
        {/* 중앙 바 */}
        <View
          style={{
            width: 8 * s,
            height: 1.8 * s,
            backgroundColor: color,
            borderRadius: 1 * s,
          }}
        />
        {/* 왼쪽 안쪽 원판 */}
        <View
          style={{
            position: 'absolute',
            left: 2.2 * s,
            width: 1.8 * s,
            height: 7 * s,
            backgroundColor: color,
            borderRadius: 0.9 * s,
          }}
        />
        {/* 왼쪽 바깥쪽 원판 */}
        <View
          style={{
            position: 'absolute',
            left: 0.4 * s,
            width: 1.5 * s,
            height: 4.6 * s,
            backgroundColor: color,
            borderRadius: 0.8 * s,
          }}
        />
        {/* 오른쪽 안쪽 원판 */}
        <View
          style={{
            position: 'absolute',
            right: 2.2 * s,
            width: 1.8 * s,
            height: 7 * s,
            backgroundColor: color,
            borderRadius: 0.9 * s,
          }}
        />
        {/* 오른쪽 바깥쪽 원판 */}
        <View
          style={{
            position: 'absolute',
            right: 0.4 * s,
            width: 1.5 * s,
            height: 4.6 * s,
            backgroundColor: color,
            borderRadius: 0.8 * s,
          }}
        />
      </View>
    </View>
  );
}

/**
 * 스톱워치/타이머 아이콘 — 루틴 소요 시간 표시용
 */
export function StopwatchIcon({ color = '#9CA3AF', size = 15 }: IconProps) {
  const s = size / 15;
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      {/* 상단 꼭지 */}
      <View
        style={{
          position: 'absolute',
          top: 0.5 * s,
          width: 4.5 * s,
          height: 1.5 * s,
          backgroundColor: color,
          borderRadius: 0.8 * s,
        }}
      />
      {/* 시계 몸통 */}
      <View
        style={[
          styles.center,
          {
            marginTop: 1.5 * s,
            width: 11.5 * s,
            height: 11.5 * s,
            borderRadius: 5.75 * s,
            borderWidth: 1.5 * s,
            borderColor: color,
          },
        ]}>
        {/* 시계 바늘 */}
        <View
          style={{
            width: 1.5 * s,
            height: 3.5 * s,
            backgroundColor: color,
            borderRadius: 0.8 * s,
            marginBottom: 1.5 * s,
          }}
        />
      </View>
    </View>
  );
}

/**
 * 불꽃(칼로리) 아이콘 — 소모 칼로리 표시용
 */
export function FlameIcon({ color = '#9CA3AF', size = 15 }: IconProps) {
  const s = size / 15;
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      <View
        style={{
          width: 10 * s,
          height: 10 * s,
          borderTopLeftRadius: 2 * s,
          borderTopRightRadius: 6 * s,
          borderBottomLeftRadius: 6 * s,
          borderBottomRightRadius: 6 * s,
          borderWidth: 1.5 * s,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
          marginTop: 1.5 * s,
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: 1.2 * s,
        }}>
        <View
          style={{
            width: 3 * s,
            height: 3 * s,
            borderRadius: 1.5 * s,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );
}

/**
 * 우측 꺾쇠(>) 아이콘 — '주간 계획 >' 링크용
 */
export function ChevronRightIcon({ color = '#666666', size = 12 }: IconProps) {
  const box = size * 0.58;
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      <View
        style={{
          width: box,
          height: box,
          borderTopWidth: 1.6,
          borderRightWidth: 1.6,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
          marginLeft: -2,
        }}
      />
    </View>
  );
}

/**
 * 좌측 화살표(←) 아이콘 — 상단 뒤로가기 원형 버튼용
 */
export function ArrowLeftIcon({ color = '#111111', size = 18 }: IconProps) {
  const s = size / 18;
  const stroke = 1.8 * s;
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      {/* 가로 몸통 선 */}
      <View
        style={{
          width: 12.5 * s,
          height: stroke,
          backgroundColor: color,
          borderRadius: stroke / 2,
          marginLeft: 1 * s,
        }}
      />
      {/* 왼쪽 화살촉 */}
      <View
        style={{
          position: 'absolute',
          left: 3 * s,
          width: 6.8 * s,
          height: 6.8 * s,
          borderBottomWidth: stroke,
          borderLeftWidth: stroke,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

/**
 * 연필(수정) 아이콘 — 상단 우측 편집 원형 버튼용
 */
export function PencilIcon({ color = '#111111', size = 18 }: IconProps) {
  const s = size / 18;
  const stroke = 1.5 * s;
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      <View
        style={[
          styles.center,
          {
            transform: [{ rotate: '45deg' }],
          },
        ]}>
        {/* 연필 몸통 */}
        <View
          style={{
            width: 4.8 * s,
            height: 11.5 * s,
            borderWidth: stroke,
            borderColor: color,
            borderTopLeftRadius: 1.4 * s,
            borderTopRightRadius: 1.4 * s,
            justifyContent: 'flex-start',
          }}>
          {/* 상단 지우개 구분선 */}
          <View
            style={{
              marginTop: 2 * s,
              width: '100%',
              height: stroke * 0.85,
              backgroundColor: color,
            }}
          />
        </View>
        {/* 연필 촉 (삼각형) */}
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: 2.4 * s,
            borderRightWidth: 2.4 * s,
            borderTopWidth: 3.4 * s,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: color,
            marginTop: -0.5 * s,
          }}
        />
      </View>
    </View>
  );
}

/**
 * 플러스(+) 아이콘 — 주간 계획 편집 화면 빈 요일 슬롯용
 */
export function PlusIcon({ color = '#9CA3AF', size = 20 }: IconProps) {
  const stroke = Math.max(1.6, size * 0.085);
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      <View
        style={{
          position: 'absolute',
          width: size * 0.85,
          height: stroke,
          backgroundColor: color,
          borderRadius: stroke / 2,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: stroke,
          height: size * 0.85,
          backgroundColor: color,
          borderRadius: stroke / 2,
        }}
      />
    </View>
  );
}

/**
 * 3선 드래그 핸들(≡) 아이콘 — 주간 계획 편집 화면 루틴 카드 우측 핸들용
 */
export function DragHandleIcon({ color = '#71717A', size = 18 }: IconProps) {
  const s = size / 18;
  const lineStyle = {
    width: 16 * s,
    height: 1.7 * s,
    backgroundColor: color,
    borderRadius: 0.9 * s,
  };
  return (
    <View
      style={[
        styles.center,
        {
          width: size,
          height: size,
          gap: 3.4 * s,
        },
      ]}>
      <View style={lineStyle} />
      <View style={lineStyle} />
      <View style={lineStyle} />
    </View>
  );
}

/**
 * 하단 탭 바 — 홈(집 모양) 아이콘
 */
export function HomeTabIcon({ color = '#111111', size = 22 }: IconProps) {
  const s = size / 22;
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      {/* 지붕 (삼각형 라인) */}
      <View
        style={{
          width: 12 * s,
          height: 12 * s,
          borderTopWidth: 1.8 * s,
          borderLeftWidth: 1.8 * s,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
          position: 'absolute',
          top: 3.5 * s,
          borderTopLeftRadius: 1.5 * s,
        }}
      />
      {/* 집 몸통 */}
      <View
        style={{
          position: 'absolute',
          bottom: 2 * s,
          width: 14 * s,
          height: 10.5 * s,
          borderLeftWidth: 1.8 * s,
          borderRightWidth: 1.8 * s,
          borderBottomWidth: 1.8 * s,
          borderColor: color,
          borderBottomLeftRadius: 1.5 * s,
          borderBottomRightRadius: 1.5 * s,
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}>
        {/* 문 */}
        <View
          style={{
            width: 4.6 * s,
            height: 6 * s,
            borderTopWidth: 1.6 * s,
            borderLeftWidth: 1.6 * s,
            borderRightWidth: 1.6 * s,
            borderColor: color,
            borderTopLeftRadius: 1 * s,
            borderTopRightRadius: 1 * s,
          }}
        />
      </View>
    </View>
  );
}

/**
 * 하단 탭 바 — 기록 / 코치 막대 차트(포디움) 아이콘
 */
export function ChartTabIcon({ color = '#A1A1AA', size = 22 }: IconProps) {
  const s = size / 22;
  const stroke = 1.7 * s;
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      <View
        style={{
          width: 17 * s,
          height: 16 * s,
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'center',
          borderBottomWidth: stroke,
          borderColor: color,
        }}>
        {/* 왼쪽 막대 (중간 높이) */}
        <View
          style={{
            width: 4.5 * s,
            height: 9.5 * s,
            borderTopWidth: stroke,
            borderLeftWidth: stroke,
            borderColor: color,
            borderTopLeftRadius: 1 * s,
          }}
        />
        {/* 가운데 막대 (가장 높음) */}
        <View
          style={{
            width: 5 * s,
            height: 14.5 * s,
            borderTopWidth: stroke,
            borderLeftWidth: stroke,
            borderRightWidth: stroke,
            borderColor: color,
            borderTopLeftRadius: 1 * s,
            borderTopRightRadius: 1 * s,
          }}
        />
        {/* 오른쪽 막대 (낮은 높이) */}
        <View
          style={{
            width: 4.5 * s,
            height: 6.5 * s,
            borderTopWidth: stroke,
            borderRightWidth: stroke,
            borderColor: color,
            borderTopRightRadius: 1 * s,
          }}
        />
      </View>
    </View>
  );
}

/**
 * 하단 탭 바 — 나(사용자 프로필) 아이콘
 */
export function ProfileTabIcon({ color = '#A1A1AA', size = 22 }: IconProps) {
  const s = size / 22;
  const stroke = 1.7 * s;
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      {/* 머리 */}
      <View
        style={{
          width: 7.5 * s,
          height: 7.5 * s,
          borderRadius: 3.75 * s,
          borderWidth: stroke,
          borderColor: color,
          marginBottom: 2 * s,
        }}
      />
      {/* 어깨/몸통 아치 */}
      <View
        style={{
          width: 14 * s,
          height: 6.5 * s,
          borderTopLeftRadius: 7 * s,
          borderTopRightRadius: 7 * s,
          borderTopWidth: stroke,
          borderLeftWidth: stroke,
          borderRightWidth: stroke,
          borderColor: color,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
