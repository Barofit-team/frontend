import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  Delegate,
  MediapipeCamera,
  RunningMode,
  usePoseDetection,
  type DetectionError,
  type PoseDetectionResultBundle,
} from 'react-native-mediapipe-posedetection';
import { useCameraPermission } from 'react-native-vision-camera';

export default function App() {
  const router = useRouter();

  const [landmarkCount, setLandmarkCount] = useState(0);

  const { hasPermission, requestPermission } = useCameraPermission();

  const handleRequestPermission = async () => {
    await requestPermission();
  };

  const handleResults = useCallback((result: PoseDetectionResultBundle) => {
    console.log('Pose detected!', result.results);
    console.log('Number of poses:', result.results?.length);
    const count = result.results?.[0]?.landmarks?.[0]?.length ?? 0;
    setLandmarkCount((prev) => (prev === count ? prev : count));
    console.log('Landmarks count:', count);
    // Access landmarks: result.results[0]?.landmarks
  }, []);

  const handleError = useCallback((error: DetectionError) => {
    console.error('Pose detection error:', error.message);
  }, []);

  console.log('Initializing pose detection...');

  const poseDetection = usePoseDetection(
    {
      onResults: handleResults,
      onError: handleError,
    },
    RunningMode.LIVE_STREAM,
    'pose_landmarker_lite.task', // Make sure this model file exists in your assets
    {
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      delegate: Delegate.CPU,
      fpsMode: 'none',
    },
  );

  console.log('Pose detection initialized:', poseDetection);

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Camera permission not requested.</Text>
        <TouchableOpacity
          onPress={handleRequestPermission}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Request Camera Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Camera permission denied</Text>
        <TouchableOpacity
          onPress={handleRequestPermission}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Grant Camera Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.cameraContainer}>
      <MediapipeCamera
        style={styles.camera}
        solution={poseDetection}
        activeCamera="front"
        resizeMode="cover"
      />
      <TouchableOpacity
        onPress={() => router.replace('/(tabs)/workout')}
        style={{
          position: 'absolute',
          top: 110,
          left: 20,
          backgroundColor: 'rgba(0,0,0,0.7)',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 8,
          zIndex: 10,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 16 }}>← 뒤로가기</Text>
      </TouchableOpacity>
      <View
        style={{
          position: 'absolute',
          top: 60,
          left: 20,
          backgroundColor: 'rgba(0,0,0,0.7)',
          padding: 12,
          borderRadius: 8,
        }}
      >
        <Text
          style={{
            color: '#fff',
            fontSize: 20,
            fontWeight: 'bold',
          }}
        >
          Landmarks: {landmarkCount}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
    width: '100%',
  },
  text: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
