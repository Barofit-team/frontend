import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Colors } from '@/constants/theme';
import { routinesApi } from '@/services/routines';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTtsStore } from '@/stores/useTtsStore';
import type { Category, Difficulty, RoutineDetail, RoutinePage } from '@/types/routine';
import { createPayload, initialDraft, updatePayload, type Draft } from '@/utils/routineForm';

const categories: [Category, string][] = [['FULL_BODY', '전신'], ['LOWER_BODY', '하체'], ['CORE', '코어']];
const levels: [Difficulty, string][] = [['BEGINNER', '초급'], ['INTERMEDIATE', '중급'], ['ADVANCED', '고급']];
const message = (e: unknown) => e instanceof Error ? e.message : '요청에 실패했습니다. 다시 시도해 주세요.';

export default function RoutinesScreen() {
  const userId = useAuthStore(s => s.user?.id);
  return <RoutinesContent key={userId ?? 'guest'} userId={userId} />;
}

function RoutinesContent({ userId }: { userId: string | undefined }) {
  const [category, setCategory] = useState<Category>('FULL_BODY');
  const [difficulty, setDifficulty] = useState<Difficulty>('BEGINNER');
  const [templates, setTemplates] = useState<RoutineDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [templateError, setTemplateError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<RoutineDetail | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [page, setPage] = useState<RoutinePage | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const isSpeaking = useTtsStore(s => s.isSpeaking);
  const stop = useTtsStore(s => s.stop);
  useFocusEffect(useCallback(() => () => { void stop(); }, [stop]));
  useEffect(() => {
    let active = true;
    routinesApi.templates(category, difficulty).then(data => { if (active) setTemplates(data); })
      .catch(e => { if (active) setTemplateError(message(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [category, difficulty, retry]);
  useEffect(() => {
    const version = ++generation.current;
    if (userId) routinesApi.list().then(data => { if (version === generation.current) setPage(data); })
      .catch(e => { if (version === generation.current) setError(message(e)); });
    return () => { generation.current = version + 1; };
  }, [userId]);
  function reloadTemplates() {
    setLoading(true); setTemplates([]); setTemplateError(''); setSelected(null); void stop();
  }
  function choose(routine: RoutineDetail) {
    setSelected(routine); setDraft(initialDraft(routine)); setError(''); setNotice(''); void stop();
  }
  async function action(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (e) { setError(message(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function refresh(next = 0) {
    const version = generation.current;
    const result = await routinesApi.list(next);
    if (version === generation.current) setPage(old => next && old ? { ...result, content: [...old.content, ...result.content] } : result);
  }
  async function save() {
    if (!selected || !userId) return;
    const version = generation.current;
    const result = selected.type === 'TEMPLATE'
      ? await routinesApi.create(createPayload(selected, draft))
      : await routinesApi.update(selected.id, updatePayload(selected, draft));
    if (version !== generation.current) return;
    choose(result); setNotice('루틴을 저장했습니다.'); await refresh();
  }
  return <SafeAreaView style={styles.screen} edges={['top']}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>나에게 맞는 루틴</Text>
    <Text>루틴 종류와 난이도를 고르고 운동량을 조절해 보세요.</Text>
    <Text style={styles.heading}>1. 루틴 종류</Text>
    <View style={styles.row}>{categories.map(([value, label]) => <Button key={value} title={label} disabled={busy} accessibilityState={{ selected: category === value }} variant={category === value ? 'primary' : 'outline'} onPress={() => { if (category !== value) { reloadTemplates(); setCategory(value); } }} />)}</View>
    <Text style={styles.heading}>2. 난이도</Text>
    <View style={styles.row}>{levels.map(([value, label]) => <Button key={value} title={label} disabled={busy} accessibilityState={{ selected: difficulty === value }} variant={difficulty === value ? 'primary' : 'outline'} onPress={() => { if (difficulty !== value) { reloadTemplates(); setDifficulty(value); } }} />)}</View>
    {loading && <ActivityIndicator accessibilityLabel="템플릿 불러오는 중" />}
    {!!templateError && <><Text accessibilityRole="alert" style={styles.error}>{templateError}</Text><Button title="템플릿 다시 불러오기" onPress={() => { reloadTemplates(); setRetry(v => v + 1); }} /></>}
    {!loading && !templateError && templates.length === 0 && <Text>선택한 조건의 템플릿이 없습니다.</Text>}
    {templates.map(t => <View key={t.id} style={styles.card}><Text style={styles.heading}>{t.name}</Text><Text>{t.description}</Text><Text>{t.exercises.map(e => e.name).join(' · ')}</Text><Button title="이 루틴 선택" disabled={busy} onPress={() => choose(t)} /></View>)}
    {selected && <View style={styles.card}>
      <Text style={styles.heading}>3. {selected.name} {selected.type === 'USER' ? '수정' : '설정'}</Text>
      <Text>세트 수는 1~20개, 횟수·시간은 양의 정수로 설정해 주세요. 목표는 해당 종목의 모든 세트에 적용됩니다.</Text>
      {selected.exercises.map(e => <View key={e.id} style={styles.card}>
        <Text style={styles.heading}>{e.order}. {e.name}</Text>
        <Text>세트 수</Text><Input accessibilityLabel={`${e.name} 세트 수`} value={draft[e.id]?.sets ?? ''} editable={!busy} keyboardType="number-pad" onChangeText={sets => setDraft(d => ({ ...d, [e.id]: { ...d[e.id], sets } }))} />
        <Text>{e.measurementType === 'REPS' ? '세트당 횟수' : '세트당 시간(초)'}</Text><Input accessibilityLabel={`${e.name} 목표`} value={draft[e.id]?.target ?? ''} editable={!busy} keyboardType="number-pad" onChangeText={target => setDraft(d => ({ ...d, [e.id]: { ...d[e.id], target } }))} />
        <Text>{e.introTtsText}</Text>
        <Button title={`${e.name} 시작 안내 미리 듣기`} variant="outline" onPress={() => { void (async () => { await stop(); await useTtsStore.getState().speak(e.introTtsText); })(); }} />
      </View>)}
      {isSpeaking && <Button title="안내 중지" variant="outline" onPress={() => { void stop(); }} />}
      {userId ? <Button title={busy ? '처리 중…' : selected.type === 'USER' ? '변경 저장' : '내 루틴으로 저장'} disabled={busy} onPress={() => { void action(save); }} /> : <Button title="로그인하고 저장하기" onPress={() => router.push('/login')} />}
    </View>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!!notice && <Text accessibilityRole="alert">{notice}</Text>}
    <Text style={styles.heading}>내 루틴</Text>
    {!userId ? <Text>로그인하면 저장한 루틴을 볼 수 있어요.</Text> : <>
      <Button title="목록 새로고침" variant="outline" disabled={busy} onPress={() => { void action(() => refresh()); }} />
      {page?.totalElements === 0 && <Text>저장한 루틴이 없습니다.</Text>}
      {page?.content.map(r => <View key={r.id} style={styles.card}><Text style={styles.heading}>{r.name}</Text><Text>{r.exerciseCount}종목 · 총 {r.totalSetCount}세트</Text>
        <Button title={`${r.name} 수정`} disabled={busy} onPress={() => { void action(async () => { const version = generation.current; const detail = await routinesApi.detail(r.id); if (version === generation.current) choose(detail); }); }} />
        <Button title={`${r.name} 삭제`} variant="outline" disabled={busy} onPress={() => setDeleting(r.id)} />
        {deleting === r.id && <><Text>이 루틴을 삭제할까요?</Text><Button title="삭제 확인" disabled={busy} onPress={() => { void action(async () => { const version = generation.current; await routinesApi.remove(r.id); if (version !== generation.current) return; setDeleting(null); if (selected?.id === r.id) { setSelected(null); await stop(); } setNotice('루틴을 삭제했습니다.'); await refresh(); }); }} /><Button title="취소" variant="outline" disabled={busy} onPress={() => setDeleting(null)} /></>}
      </View>)}
      {page && page.page + 1 < page.totalPages && <Button title="더 보기" disabled={busy} onPress={() => { void action(() => refresh(page.page + 1)); }} />}
    </>}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, gap: 16 }, title: { fontSize: 26, fontWeight: '700', color: Colors.text },
  heading: { fontSize: 18, fontWeight: '600', color: Colors.text },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { padding: 16, gap: 12, borderWidth: 1, borderColor: Colors.border, borderRadius: 12 },
  error: { color: Colors.danger },
});
