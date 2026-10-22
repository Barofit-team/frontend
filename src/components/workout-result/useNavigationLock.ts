/**
 * 버튼 연타로 화면 이동이 여러 번 실행되는 것을 막습니다.
 * 한 번 이동하면 잠기고, 이 화면에 다시 포커스가 오면(예: 다음 화면에서 돌아옴) 풀립니다.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

export function useNavigationLock() {
  const lockedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      lockedRef.current = false;
    }, [])
  );

  return useCallback((navigate: () => void) => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    navigate();
  }, []);
}
