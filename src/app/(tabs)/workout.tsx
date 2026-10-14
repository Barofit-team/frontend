import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { router } from 'expo-router';
import { Button, StyleSheet, View } from 'react-native';

export default function WorkoutScreen() {
  return (
    <View style={styles.container}>
      <PlaceholderScreen
        title="운동"
        description="운동 루틴 화면 (구현 예정)"
      />

      <View style={styles.buttonContainer}>
        <Button
          title="MediaPipe 카메라 테스트"
          onPress={() => router.push('/pose-test')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  buttonContainer: {
    padding: 20,
  },
});
