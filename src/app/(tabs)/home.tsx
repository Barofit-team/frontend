import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { Button } from '@/components/ui/Button';
import { triggerManualInactivityAlarm } from '@/services/inactivityAlarmService';

export default function HomeScreen() {
  return (
    <PlaceholderScreen title="홈" description="홈 화면 (구현 예정)">
      <Button title="알람 수동 발송" onPress={triggerManualInactivityAlarm} />
    </PlaceholderScreen>
  );
}
