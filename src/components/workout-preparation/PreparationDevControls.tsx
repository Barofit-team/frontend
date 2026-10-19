/**
 * [개발용] 단계 전환 + 기울기 센서 진단 패널. __DEV__ 빌드에서만 렌더링됩니다.
 *  - 상단 바: ◀ ▶ 단계 이동, 모드 전환(센서 / 수동 UI 확인)
 *  - 하단 패널(센서 모드의 Adjust Angle 단계): 원시 센서값과 계산값, 목표 각도 지정, 자동 이동 on/off
 */
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ANGLE_CONFIG } from './angleConfig';
import {
  PREPARATION_STEP_LABELS,
  stepIndex,
  stepsForMode,
  type PreparationMode,
  type PreparationStep,
} from './steps';
import type { PitchDiagnostics } from './useDevicePitch';

type PreparationDevControlsProps = {
  step: PreparationStep;
  mode: PreparationMode;
  top: number;
  bottom: number;
  onPrev: () => void;
  onNext: () => void;
  onToggleMode: () => void;
  /** 센서 모드의 Adjust Angle 단계에서만 전달 */
  sensor?: {
    diagnostics: PitchDiagnostics;
    autoAdvance: boolean;
    onToggleAutoAdvance: () => void;
    onCaptureTarget: () => void;
    onClearTarget: () => void;
  };
};

const f = (v: number | null | undefined, digits = 1, unit = '°') =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v.toFixed(digits)}${unit}`;

export function PreparationDevControls({
  step,
  mode,
  top,
  bottom,
  onPrev,
  onNext,
  onToggleMode,
  sensor,
}: PreparationDevControlsProps) {
  const [collapsed, setCollapsed] = useState(false);
  if (!__DEV__) return null;
  const steps = stepsForMode(mode);
  const index = stepIndex(step, mode);
  const isFirst = index <= 0;
  const isLast = index === steps.length - 1;
  const label = mode === 'sensor' && index === 1 ? 'Adjust Angle (센서)' : PREPARATION_STEP_LABELS[step];
  const d = sensor?.diagnostics;

  return (
    <>
      <View pointerEvents="box-none" style={[styles.topWrapper, { top }]}>
        <View style={styles.bar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="이전 단계 (개발용)"
            disabled={isFirst}
            hitSlop={8}
            onPress={onPrev}>
            <Text style={[styles.arrow, isFirst && styles.disabled]}>◀</Text>
          </Pressable>
          <Text style={styles.label}>
            DEV {index + 1}/{steps.length} · {label}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="다음 단계 (개발용)"
            disabled={isLast}
            hitSlop={8}
            onPress={onNext}>
            <Text style={[styles.arrow, isLast && styles.disabled]}>▶</Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="모드 전환 (개발용)"
          onPress={onToggleMode}
          style={styles.modeChip}>
          <Text style={styles.modeText}>
            {mode === 'sensor' ? '모드: 실제 센서 ⇄' : '모드: 수동 UI 확인 ⇄'}
          </Text>
        </Pressable>
      </View>

      {sensor && d && (
        <View pointerEvents="box-none" style={[styles.bottomWrapper, { bottom: bottom + 8 }]}>
          <View style={styles.panel}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="센서 진단 접기/펼치기 (개발용)"
              hitSlop={8}
              onPress={() => setCollapsed(c => !c)}>
              <Text style={styles.panelTitle}>
                {collapsed
                  ? `센서 진단 ▴  ${d.sensor} · Pitch ${f(d.pitchDeg)} · Target ${d.targetDeg === null ? '미설정' : f(d.targetDeg)} · ${d.status}`
                  : '센서 진단 (DEV) ▾ 접기'}
              </Text>
            </Pressable>
            {!collapsed && (
              <>
                <Text style={styles.mono}>
                  {`Sensor: ${d.sensor}   수신 ${d.samplesPerSec.toFixed(1)}/s · 간격 ${f(d.reportedIntervalMs, 0, '')}  · 무시 ${d.invalidSamples}\n`}
                  {`[원시] g=(${f(d.gravity?.x, 2, '')}, ${f(d.gravity?.y, 2, '')}, ${f(d.gravity?.z, 2, '')}) m/s²  |g|=${f(d.magnitudeG, 2, 'g')}\n`}
                  {`[원시] rotation.beta: ${f(d.betaDeg)} (참고)\n`}
                  {`[계산] Pitch: ${f(d.rawPitchDeg)} → 스무딩 ${f(d.pitchDeg)}\n`}
                  {`Target: ${d.targetDeg === null ? '미설정' : f(d.targetDeg)}  오차: ${f(d.errorDeg)}  (±${ANGLE_CONFIG.toleranceDeg}° 임시)\n`}
                  {`Status: ${d.status}  유지 ${(d.alignedForMs / 1000).toFixed(1)}s / ${(ANGLE_CONFIG.holdMs / 1000).toFixed(1)}s`}
                </Text>
                <View style={styles.row}>
                  <DevButton
                    title="현재 각도를 목표로"
                    onPress={sensor.onCaptureTarget}
                    disabled={d.pitchDeg === null}
                  />
                  <DevButton
                    title="목표 해제"
                    onPress={sensor.onClearTarget}
                    disabled={d.targetDeg === null}
                  />
                  <DevButton
                    title={`자동 이동 ${sensor.autoAdvance ? 'ON' : 'OFF'}`}
                    onPress={sensor.onToggleAutoAdvance}
                    active={sensor.autoAdvance}
                  />
                </View>
              </>
            )}
          </View>
        </View>
      )}
    </>
  );
}

function DevButton({
  title,
  onPress,
  disabled,
  active,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.devButton, active && styles.devButtonActive, disabled && styles.disabled]}>
      <Text style={styles.devButtonText}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topWrapper: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 4 },
  bottomWrapper: { position: 'absolute', left: 8, right: 8 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(17,17,17,0.72)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  label: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  arrow: { color: '#FFFFFF', fontSize: 12, paddingHorizontal: 2 },
  disabled: { opacity: 0.3 },
  modeChip: {
    backgroundColor: 'rgba(17,17,17,0.55)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  modeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '600' },
  panel: {
    backgroundColor: 'rgba(17,17,17,0.82)',
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  panelTitle: { color: '#9EE6B8', fontSize: 11, fontWeight: '700' },
  mono: {
    color: '#FFFFFF',
    fontSize: 10,
    lineHeight: 15,
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
  },
  row: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  devButton: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  devButtonActive: { backgroundColor: '#2E9E5B' },
  devButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
});
