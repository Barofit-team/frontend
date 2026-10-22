/**
 * 운동 진행 화면 상단 카메라 영역.
 *
 *  - 전면 카메라·권한·라이프사이클·오류 처리는 UserPositionCamera를 그대로 사용합니다.
 *  - 운동 상태(타이머·횟수)는 알지 못합니다. 표시만 담당합니다.
 *  - children: 카메라 영상 위에 겹칠 레이어 자리(추후 AI 스켈레톤·자세 피드백 Overlay).
 *    현재 단계에서는 전달하지 않습니다.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PreparationHeader } from '@/components/workout-preparation/PreparationHeader';
import { PrepColors } from '@/components/workout-preparation/palette';
import { UserPositionCamera } from '@/components/workout-preparation/UserPositionCamera';

const CAMERA_PERMISSION_DESCRIPTION = '운동 중 자세를 확인할 수 있도록\n카메라 접근을 허용해 주세요.';

type ExerciseCameraAreaProps = {
  onPressClose: () => void;
  onPressVoice?: () => void;
  /** 카메라 영상 위 Overlay (AI 연동 시 사용) */
  children?: ReactNode;
};

export function ExerciseCameraArea({ onPressClose, onPressVoice, children }: ExerciseCameraAreaProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <UserPositionCamera permissionDescription={CAMERA_PERMISSION_DESCRIPTION}>
        {children ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {children}
          </View>
        ) : null}
        <View style={[styles.controls, { paddingTop: insets.top }]} pointerEvents="box-none">
          <PreparationHeader onGray onPressClose={onPressClose} onPressVoice={onPressVoice} />
        </View>
      </UserPositionCamera>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: PrepColors.cameraBackground },
  controls: { position: 'absolute', top: 0, right: 0, left: 0 },
});
