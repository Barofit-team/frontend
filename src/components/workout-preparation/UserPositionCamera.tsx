/**
 * User Position 카메라 영역: 전면 카메라 실시간 프리뷰 + 권한/오류 안내.
 *
 * 개인정보 원칙 (이번 단계)
 *  - 화면 미리보기만 합니다. 촬영(takePictureAsync)·녹화(recordAsync)·저장·서버 전송·영상 분석을 하지 않습니다.
 *  - 카메라 권한만 요청합니다. 마이크 권한은 요청하지 않습니다(app.json expo-camera 플러그인에서 마이크 비활성).
 *
 * 생명주기
 *  - 화면 포커스 + 앱 active + 권한 허용일 때만 CameraView를 마운트합니다.
 *    (expo-camera 문서: 동시에 하나의 프리뷰만 활성 가능 → 포커스를 잃으면 언마운트)
 *  - User Position 대기 ↔ 완료 전환 시에는 부모가 같은 위치에 이 컴포넌트를 유지하므로
 *    CameraView 인스턴스가 그대로 유지됩니다(카메라 재시작 없음).
 *  - 이전 단계로 이동 / 화면 닫기 / 백그라운드 → 언마운트되어 카메라 세션 종료.
 */
import { CameraView, useCameraPermissions, type CameraMountError } from 'expo-camera';
import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Linking, StyleSheet, Text, View, type AppStateStatus } from 'react-native';

import { Button } from '@/components/ui/Button';
import { FontSize, Spacing } from '@/constants/theme';

import { PrepColors } from './palette';

const LOG = '[UserPositionCamera]';

export type CameraPermissionState =
  | 'checking' // 권한 상태 확인 중
  | 'requestable' // 아직 요청 전 / 다시 요청 가능
  | 'granted'
  | 'denied' // 거부됨, 다시 요청 가능
  | 'blocked'; // 거부됨, 운영체제 설정에서 변경 필요

type CameraState = 'starting' | 'ready' | 'error';

/** 카메라 영역 바로 위(가이드·헤더 아래)에 그려지는 안내 */
function Notice({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={styles.notice} accessibilityLiveRegion="polite">
      <Text style={styles.noticeTitle}>{title}</Text>
      {!!body && <Text style={styles.noticeBody}>{body}</Text>}
      {action}
    </View>
  );
}

const DEFAULT_PERMISSION_DESCRIPTION = '운동 준비 화면에서 사용자 위치를\n확인할 수 있도록 카메라 접근을\n허용해 주세요.';

type UserPositionCameraProps = {
  /** 카메라 영상 위에 겹칠 UI(헤더·점선 가이드). 권한/오류 안내는 이보다 위에 표시 */
  children?: ReactNode;
  /** 권한 요청 안내 문구. 다른 화면(예: 운동 진행)에서 재사용할 때 화면에 맞는 문구로 교체 */
  permissionDescription?: string;
};

export function UserPositionCamera({
  children,
  permissionDescription = DEFAULT_PERMISSION_DESCRIPTION,
}: UserPositionCameraProps) {
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mountKey, setMountKey] = useState(0);
  const autoRequested = useRef(false);

  // 앱 활성 상태 추적. 복귀 시 설정 앱에서 바꾼 권한을 다시 읽음
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      setAppActive(s === 'active');
      if (s === 'active') getPermission().catch(() => {});
    });
    return () => sub.remove();
  }, [getPermission]);

  // 첫 진입 시 한 번만 권한 요청 (반복 강제 요청 금지)
  useEffect(() => {
    if (!permission || permission.granted || autoRequested.current) return;
    if (permission.status === 'undetermined' && permission.canAskAgain) {
      autoRequested.current = true;
      if (__DEV__) console.log(LOG, 'request permission');
      requestPermission().catch(e => __DEV__ && console.warn(LOG, 'request failed', e));
    }
  }, [permission, requestPermission]);

  const permissionState: CameraPermissionState = !permission
    ? 'checking'
    : permission.granted
      ? 'granted'
      : permission.status === 'undetermined'
        ? 'requestable'
        : permission.canAskAgain
          ? 'denied'
          : 'blocked';

  const shouldMount = permissionState === 'granted' && isFocused && appActive;

  // 마운트 단위(sessionKey)별로 준비/오류 상태를 기록 → 재마운트 시 자동으로 '준비 중'부터 시작
  const sessionKey = `${shouldMount}-${mountKey}`;
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const [errorFor, setErrorFor] = useState<string | null>(null);
  const state: CameraState =
    errorFor === sessionKey ? 'error' : readyFor === sessionKey ? 'ready' : 'starting';

  useEffect(() => {
    if (__DEV__)
      console.log(LOG, shouldMount ? 'mount CameraView' : 'unmount CameraView', {
        permissionState,
        isFocused,
        appActive,
      });
  }, [shouldMount, permissionState, isFocused, appActive]);

  const retryCamera = () => {
    setErrorMessage(null);
    setMountKey(k => k + 1);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {shouldMount && state !== 'error' && (
        <CameraView
          key={mountKey}
          style={StyleSheet.absoluteFill}
          facing="front"
          mode="picture"
          animateShutter={false}
          onCameraReady={() => {
            if (__DEV__) console.log(LOG, 'camera ready');
            setReadyFor(sessionKey);
          }}
          onMountError={(e: CameraMountError) => {
            if (__DEV__) console.warn(LOG, 'mount error', e?.message);
            setErrorMessage(e?.message ?? null);
            setErrorFor(sessionKey);
          }}
        />
      )}

      {children}

      {/* 상태 안내 (권한 / 준비 / 오류). 가이드 위에 표시 */}
      <View style={styles.noticeLayer} pointerEvents="box-none">
        {permissionState === 'checking' && <Notice title="카메라 권한을 확인하고 있어요" />}
        {permissionState === 'requestable' && (
          <Notice
            title="카메라 권한이 필요합니다"
            body={permissionDescription}
            action={
              <Button
                title="카메라 허용하기"
                variant="outline"
                onPress={() => requestPermission()}
                style={styles.action}
              />
            }
          />
        )}
        {permissionState === 'denied' && (
          <Notice
            title="카메라 권한이 필요합니다"
            body={permissionDescription}
            action={
              <Button
                title="다시 요청하기"
                variant="outline"
                onPress={() => requestPermission()}
                style={styles.action}
              />
            }
          />
        )}
        {permissionState === 'blocked' && (
          <Notice
            title="카메라 권한이 꺼져 있어요"
            body={'설정 > 앱에서 카메라 접근을 허용한 뒤\n다시 돌아와 주세요.'}
            action={
              <Button
                title="설정 열기"
                variant="outline"
                onPress={() => Linking.openSettings().catch(() => {})}
                style={styles.action}
              />
            }
          />
        )}
        {shouldMount && state === 'starting' && <Notice title="카메라를 준비하고 있어요" />}
        {shouldMount && state === 'error' && (
          <Notice
            title="카메라를 시작할 수 없어요"
            body={`다른 앱이 카메라를 사용 중이거나 일시적인 오류일 수 있어요.${errorMessage && __DEV__ ? `\n(${errorMessage})` : ''}`}
            action={
              <Button title="다시 시도" variant="outline" onPress={retryCamera} style={styles.action} />
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  noticeLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  notice: {
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 16,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    maxWidth: 360,
  },
  noticeTitle: { fontSize: FontSize.md, fontWeight: '700', color: PrepColors.text, textAlign: 'center' },
  noticeBody: { fontSize: 13, lineHeight: 20, color: PrepColors.textSecondary, textAlign: 'center' },
  action: {
    borderRadius: 999,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
  },
});
