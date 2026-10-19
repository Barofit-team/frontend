import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { startCoachWebSocketListener } from '@/services/ttsService';
import { useTtsStore } from '@/stores/useTtsStore';

export function TtsConsole() {
  const {
    socketStatus,
    wsUrl,
    isPlaying,
    currentText,
    lastMessage,
    connectWebSocket,
    disconnectWebSocket,
    stop,
  } = useTtsStore();

  // 운동 화면 진입 시 웹소켓 연결 및 리스닝 시작
  useEffect(() => {
    const cleanup = startCoachWebSocketListener();
    return cleanup;
  }, []);

  const getStatusText = () => {
    switch (socketStatus) {
      case 'connected':
        return '[연결됨] 백엔드 음성 수신 대기 중 (Listening)';
      case 'connecting':
        return '[연결 시도 중] 백엔드 웹소켓 연결 중...';
      case 'error':
        return '[연결 대기] 백엔드 웹소켓 서버 오프라인';
      default:
        return '[연결 해제됨] 운동 대기 상태';
    }
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      {/* 1. 운동 시작 웹소켓 리스닝 및 오디오 출력 상태 */}
      <Card style={[styles.statusCard, isPlaying && styles.playingCard]}>
        <View style={styles.rowBetween}>
          <Text style={styles.statusTitle}>
            {isPlaying ? '[출력 중] 코칭 오디오 재생 중' : '[대기 중] 스피커 준비 완료'}
          </Text>
          {isPlaying && (
            <Pressable onPress={stop} style={styles.stopBadge}>
              <Text style={styles.stopBadgeText}>정지</Text>
            </Pressable>
          )}
        </View>

        {isPlaying && currentText.trim().length > 0 && (
          <Text style={styles.playingText}>"{currentText}"</Text>
        )}

        <View style={styles.wsDivider} />

        <View style={styles.rowBetween}>
          <View style={styles.wsInfoCol}>
            <Text style={styles.wsStatusText}>{getStatusText()}</Text>
            <Text style={styles.wsUrlText}>{wsUrl}</Text>
          </View>
          {socketStatus !== 'connected' ? (
            <Pressable onPress={() => connectWebSocket()} style={styles.wsBtn}>
              <Text style={styles.wsBtnText}>운동 시작 (연결)</Text>
            </Pressable>
          ) : (
            <Pressable onPress={disconnectWebSocket} style={styles.wsBtn}>
              <Text style={styles.wsBtnText}>운동 종료 (해제)</Text>
            </Pressable>
          )}
        </View>
      </Card>

      {/* 2. 최근 수신/출력된 코칭 정보 */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>최근 출력된 코칭 내역</Text>
        <Card style={styles.messageBox}>
          {lastMessage ? (
            <View style={styles.messageContent}>
              <View style={styles.badgeRow}>
                <Text style={styles.typeBadge}>{lastMessage.type || 'AUDIO'}</Text>
                <Text style={styles.timeText}>{lastMessage.timestamp}</Text>
              </View>
              <Text style={styles.messageText}>"{lastMessage.text}"</Text>
            </View>
          ) : (
            <Text style={styles.emptyText}>아직 출력된 코칭 음성이 없습니다.</Text>
          )}
        </Card>
      </View>

      {/* 3. 로컬 MP3 파일 재생 안내 */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>로컬 MP3 파일 출력 안내</Text>
        <Card style={styles.infoCard}>
          <Text style={styles.helperTip}>
            1. 브라우저에서 다운로드한 .mp3 파일을 frontend/assets/audio/ 폴더에 넣습니다.
          </Text>
          <Text style={styles.helperTip}>
            2. playLocalMp3(require('../../assets/audio/파일명.mp3'), '설명') 함수를 호출하면 즉시 출력됩니다.
          </Text>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl * 2,
    gap: Spacing.md,
  },
  statusCard: {
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  playingCard: {
    borderColor: Colors.primary,
    backgroundColor: '#F0F7FF',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  stopBadge: {
    backgroundColor: Colors.danger,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  stopBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  playingText: {
    fontSize: FontSize.md,
    color: Colors.primary,
    marginTop: Spacing.xs,
    fontWeight: '600',
  },
  wsDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
  wsInfoCol: {
    flex: 1,
    gap: 2,
  },
  wsStatusText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  wsUrlText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  wsBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  wsBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
  },
  section: {
    gap: Spacing.xs,
  },
  sectionLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  messageBox: {
    padding: Spacing.md,
    backgroundColor: Colors.surface,
  },
  messageContent: {
    gap: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  typeBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#DBEAFE',
    color: '#1D4ED8',
    overflow: 'hidden',
  },
  timeText: {
    fontSize: 11,
    color: Colors.textSecondary,
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
  infoCard: {
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    gap: Spacing.xs,
  },
  helperTip: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
});
