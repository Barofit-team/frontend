/**
 * 운동 진행 화면 전체화면 카메라 레이어.
 *
 *  - 전면 카메라·권한·라이프사이클·오류 처리는 UserPositionCamera를 그대로 사용합니다.
 *  - 세션 화면 동안 한 번만 마운트되어 준비·운동·휴식·일시정지 사이에서 카메라가 재시작되지 않습니다.
 *    (판정은 workout-session의 handlePoseFrame이 운동 단계에서만 수행)
 *  - 스켈레톤은 F03와 같은 밝은 색(F03Colors) 사용.
 *  - 상단 HUD·하단 pill 등 UI는 이 레이어 위에 따로 겹칩니다.
 */
import type { PoseFrame } from '@barofit/pose';
import { StyleSheet, View } from 'react-native';

import { UserPositionCamera } from '@/components/workout-preparation/UserPositionCamera';

import { SessionColors } from './sessionPalette';

const CAMERA_PERMISSION_DESCRIPTION = '운동 중 자세를 확인할 수 있도록\n카메라 접근을 허용해 주세요.';

type ExerciseCameraAreaProps = {
  onPoseFrame?: (frame: PoseFrame, meta: { frameId: number; inferenceMs: number }) => void;
  selectedSide?: 'left' | 'right' | 'both' | null;
};

export function ExerciseCameraArea({ onPoseFrame, selectedSide = 'both' }: ExerciseCameraAreaProps) {
  return (
    <View style={styles.container}>
      <UserPositionCamera
        permissionDescription={CAMERA_PERMISSION_DESCRIPTION}
        onPoseFrame={onPoseFrame}
        selectedSide={selectedSide}
        skeletonColors={{ bone: SessionColors.skeletonBone, joint: SessionColors.skeletonJoint }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: SessionColors.base },
});
