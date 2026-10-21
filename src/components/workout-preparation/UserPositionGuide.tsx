/**
 * User Position 가이드 (회색 카메라 영역 위).
 *  - recognized=false : 전신이 들어올 점선 영역(모서리 점 포함)
 *  - recognized=true  : 정적 스켈레톤 그래픽
 *
 * ⚠️ 스켈레톤은 와이어프레임 표현용 고정 좌표이며 실제 관절 인식 데이터가 아닙니다.
 *    추후 AI 관절 좌표를 연결할 때 JOINTS를 실제 좌표로 대체하면 됩니다.
 */
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { DottedLine } from './DottedLine';
import { PrepColors } from './palette';

type Point = { x: number; y: number };

/** 가이드 박스(가로:세로 = 1:2.4) 기준 정규화 좌표 (0~1) */
const JOINTS = {
  leftShoulder: { x: 0.18, y: 0.12 },
  rightShoulder: { x: 0.82, y: 0.12 },
  leftElbow: { x: 0.12, y: 0.26 },
  rightElbow: { x: 0.9, y: 0.26 },
  leftWrist: { x: 0.08, y: 0.39 },
  rightWrist: { x: 0.94, y: 0.39 },
  leftHip: { x: 0.3, y: 0.44 },
  rightHip: { x: 0.7, y: 0.44 },
  leftKnee: { x: 0.33, y: 0.7 },
  rightKnee: { x: 0.67, y: 0.7 },
  leftAnkle: { x: 0.33, y: 0.95 },
  rightAnkle: { x: 0.67, y: 0.95 },
} satisfies Record<string, Point>;

type JointName = keyof typeof JOINTS;

const BONES: [JointName, JointName][] = [
  ['leftShoulder', 'rightShoulder'],
  ['leftShoulder', 'leftElbow'],
  ['leftElbow', 'leftWrist'],
  ['rightShoulder', 'rightElbow'],
  ['rightElbow', 'rightWrist'],
  ['leftShoulder', 'leftHip'],
  ['rightShoulder', 'rightHip'],
  ['leftHip', 'rightHip'],
  ['leftHip', 'leftKnee'],
  ['leftKnee', 'leftAnkle'],
  ['rightHip', 'rightKnee'],
  ['rightKnee', 'rightAnkle'],
];

const BOX_RATIO = 2.4; // 세로 / 가로
const CORNER_DOT = 7;
const JOINT_DOT = 7;

type UserPositionGuideProps = { recognized: boolean };

export function UserPositionGuide({ recognized }: UserPositionGuideProps) {
  const [area, setArea] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setArea({ width, height });
  };

  // 영역 안에 1:2.4 박스를 최대한 크게 (가로는 최대 46%).
  // 인식 완료 상태는 머리가 박스 위에 그려지므로 박스를 줄이고 아래로 내린다.
  const heightRatio = recognized ? 0.72 : 0.82;
  const boxHeight = Math.min(area.height * heightRatio, area.width * 0.46 * BOX_RATIO);
  const boxWidth = boxHeight / BOX_RATIO;
  const left = (area.width - boxWidth) / 2;
  const top = (area.height - boxHeight) / 2 + (recognized ? boxWidth * 0.3 : 0);
  const at = (p: Point): Point => ({ x: left + p.x * boxWidth, y: top + p.y * boxHeight });

  const corners: Point[] = [
    { x: left, y: top },
    { x: left + boxWidth, y: top },
    { x: left + boxWidth, y: top + boxHeight },
    { x: left, y: top + boxHeight },
  ];

  return (
    <View
      style={styles.container}
      pointerEvents="none"
      onLayout={onLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {area.width > 0 && !recognized && (
        <>
          {corners.map((c, i) => (
            <DottedLine key={`edge-${i}`} from={c} to={corners[(i + 1) % 4]} dotSize={2} gap={4} />
          ))}
          {corners.map((c, i) => (
            <View key={`corner-${i}`} style={[styles.dot, dot(c, CORNER_DOT)]} />
          ))}
        </>
      )}
      {area.width > 0 && recognized && (
        <>
          {/* 머리 실루엣: 어깨선 바로 위 */}
          <View
            style={[
              styles.head,
              {
                width: boxWidth * 0.36,
                height: boxWidth * 0.44,
                borderRadius: boxWidth * 0.22,
                left: left + boxWidth * 0.32,
                top: at(JOINTS.leftShoulder).y - boxWidth * 0.54,
              },
            ]}
          />
          {BONES.map(([a, b]) => (
            <DottedLine key={`${a}-${b}`} from={at(JOINTS[a])} to={at(JOINTS[b])} dotSize={2} gap={4} />
          ))}
          {(Object.keys(JOINTS) as JointName[]).map(name => (
            <View key={name} style={[styles.dot, dot(at(JOINTS[name]), JOINT_DOT)]} />
          ))}
        </>
      )}
    </View>
  );
}

function dot(p: Point, size: number) {
  return { left: p.x - size / 2, top: p.y - size / 2, width: size, height: size, borderRadius: size / 2 };
}

const styles = StyleSheet.create({
  container: { flex: 1, alignSelf: 'stretch' },
  dot: { position: 'absolute', backgroundColor: PrepColors.black },
  head: { position: 'absolute', backgroundColor: PrepColors.silhouette },
});
