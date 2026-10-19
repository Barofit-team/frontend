import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { simulatePushMessage, startCoachWebSocketListener } from '@/services/ttsService';
import { useTtsStore } from '@/stores/useTtsStore';

export function TtsConsole() {
  const {
    socketStatus,
    isSpeaking,
    currentText,
    lastReceivedMessage,
    connectWebSocket,
    disconnectWebSocket,
    stop,
    speak,
  } = useTtsStore();

  const [customText, setCustomText] = useState('');

  // 화면 진입 시 웹소켓 수신 대기 시작 (화면 이탈 시 해제)
  useEffect(() => {
    const cleanup = startCoachWebSocketListener();
    return cleanup;
  }, []);

  const getStatusText = () => {
    switch (socketStatus) {
      case 'connected':
        return '[연결됨] 실시간 수신 대기 중';
      case 'connecting':
        return '[연결 시도 중] 백엔드 웹소켓 연결 중...';
      case 'error':
        return '[오프라인] 웹소켓 연결 안 됨 (서버 대기)';
      default:
        return '[연결 해제됨] 웹소켓 미연결';
    }
  };

  return (
    <View style={styles.container}>
      {/* 1. 웹소켓 연결 상태 */}
      <Card style={styles.statusCard}>
        <View style={styles.rowBetween}>
          <Text style={styles.statusTitle}>{getStatusText()}</Text>
        </View>
        <View style={styles.actionRow}>
          {socketStatus !== 'connected' ? (
            <Button
              title="웹소켓 재연결"
              variant="outline"
              style={styles.halfBtn}
              onPress={() => connectWebSocket()}
            />
          ) : (
            <Button
              title="연결 끊기"
              variant="outline"
              style={styles.halfBtn}
              onPress={disconnectWebSocket}
            />
          )}
        </View>
      </Card>

      {/* 2. 현재 음성 출력 상태 */}
      <Card style={[styles.statusCard, isSpeaking && styles.speakingCard]}>
        <Text style={styles.sectionLabel}>
          {isSpeaking ? '스마트폰 스피커 출력 중' : '스피커 대기 중'}
        </Text>
        {isSpeaking && currentText.trim().length > 0 && (
          <Text style={styles.speakingText}>&quot;{currentText}&quot;</Text>
        )}
        {isSpeaking && (
          <Button
            title="정지 (Stop)"
            variant="outline"
            style={styles.stopButton}
            onPress={stop}
          />
        )}
      </Card>

      {/* 3. 최근 백엔드 푸시로 수신된 메시지 */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>최근 수신된 백엔드 메시지</Text>
        <Card style={styles.messageBox}>
          {lastReceivedMessage ? (
            <Text style={styles.messageText}>&quot;{lastReceivedMessage.text}&quot;</Text>
          ) : (
            <Text style={styles.emptyText}>아직 수신된 메시지가 없습니다.</Text>
          )}
        </Card>
      </View>

      {/* 4. 백엔드 세트/종목 완료 피드백 Push 시뮬레이션 */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>백엔드 세트/종목 종료 피드백 Push 시뮬레이션</Text>
        <View style={styles.buttonCol}>
          <Button
            title="[세트 종료] 스쿼트 1세트 피드백"
            onPress={() =>
              simulatePushMessage(
                '1세트 완료, 무릎 살짝 벌려주세요.',
                'SET_FEEDBACK'
              )
            }
          />
          <Button
            title="[종목 종료] 스쿼트 완주 및 휴식 안내"
            variant="outline"
            onPress={() =>
              simulatePushMessage(
                '스쿼트 완주, 2분간 휴식하세요.',
                'EXERCISE_FINISH'
              )
            }
          />
        </View>
      </View>

      {/* 5. 직접 입력 발화 테스트 */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>직접 입력</Text>
        <View style={styles.inputRow}>
          <Input
            value={customText}
            onChangeText={setCustomText}
            placeholder="직접 입력"
            style={styles.input}
          />
          <Button
            title="출력"
            onPress={() => {
              if (customText.trim()) {
                speak(customText.trim());
                setCustomText('');
              }
            }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  statusCard: {
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  speakingCard: {
    borderColor: Colors.primary,
    backgroundColor: '#F0F7FF',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionRow: {
    marginTop: Spacing.sm,
  },
  halfBtn: {
    paddingVertical: Spacing.sm,
  },
  statusTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  sectionLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  speakingText: {
    fontSize: FontSize.md,
    color: Colors.primary,
    marginTop: Spacing.xs,
    fontStyle: 'italic',
  },
  stopButton: {
    marginTop: Spacing.sm,
  },
  section: {
    gap: Spacing.xs,
  },
  messageBox: {
    padding: Spacing.md,
    backgroundColor: Colors.surface,
  },
  messageText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  buttonCol: {
    gap: Spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
  },
});
