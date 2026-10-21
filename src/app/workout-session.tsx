/**
 * 운동 진행 화면 (Workout Session)
 *
 * Step 1: 라우트 + 전면 카메라 미리보기만 출력합니다.
 *  - 카메라 권한·라이프사이클·오류 처리는 UserPositionCamera를 그대로 재사용합니다.
 *    (화면 포커스 + 앱 active + 권한 허용일 때만 CameraView 마운트 → 화면 이탈·백그라운드 시 비활성화)
 *  - AI 분석·타이머·운동 횟수·백엔드 연동은 이번 단계 범위가 아닙니다.
 *  - 운동 준비 화면과는 아직 연결하지 않았습니다.
 *
 * 개발용 진입: barofit://workout-session
 */
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PreparationHeader } from '@/components/workout-preparation/PreparationHeader';
import { UserPositionCamera } from '@/components/workout-preparation/UserPositionCamera';
import { PrepColors } from '@/components/workout-preparation/palette';

const CAMERA_PERMISSION_DESCRIPTION = '운동 중 자세를 확인할 수 있도록\n카메라 접근을 허용해 주세요.';

/** Step 2에서 운동 정보(횟수·운동명·남은 시간)가 들어갈 하단 패널 높이 */
const BOTTOM_PANEL_HEIGHT = 168;

export default function WorkoutSessionScreen() {
  const insets = useSafeAreaInsets();

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  }, []);

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      {/* 카메라 영역: 전면 카메라 미리보기 + 상단 제어 버튼 */}
      <View style={styles.cameraArea}>
        <UserPositionCamera permissionDescription={CAMERA_PERMISSION_DESCRIPTION}>
          <View style={[styles.cameraOverlay, { paddingTop: insets.top }]} pointerEvents="box-none">
            <PreparationHeader onGray onPressClose={close} />
          </View>
        </UserPositionCamera>
      </View>

      {/* 하단 운동 정보 패널 (Step 2에서 구성) */}
      <View style={[styles.bottomPanel, { height: BOTTOM_PANEL_HEIGHT + insets.bottom, paddingBottom: insets.bottom }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PrepColors.cameraBackground },
  cameraArea: { flex: 1, overflow: 'hidden' },
  cameraOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  bottomPanel: { backgroundColor: PrepColors.white },
});
