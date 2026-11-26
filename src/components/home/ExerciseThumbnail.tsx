import React from 'react';
import { Image } from 'expo-image';
import { DumbbellIcon } from './HomeIcons';

// Static imports let Metro bundle these assets for offline use.
const EXERCISE_IMAGES: Record<string, number> = {
  'push-up': require('../../../assets/images/exercises/push-up.webp'),
  'plank': require('../../../assets/images/exercises/plank.webp'),
  'squat': require('../../../assets/images/exercises/squat.webp'),
  'bird-dog': require('../../../assets/images/exercises/bird-dog.webp'),
  'jumping-jack': require('../../../assets/images/exercises/jumping-jack.webp'),
  'lunge': require('../../../assets/images/exercises/lunge.webp'),
  'leg-raise': require('../../../assets/images/exercises/leg-raise.webp'),
  'side-lying-leg-raise': require('../../../assets/images/exercises/side-lying-leg-raise.webp'),
  'glute-bridge': require('../../../assets/images/exercises/glute-bridge.webp'),
  'dead-bug': require('../../../assets/images/exercises/dead-bug.webp'),
  'superman': require('../../../assets/images/exercises/superman.webp'),
  'pike-push-up': require('../../../assets/images/exercises/pike-push-up.webp'),
  'standing-calf-raise': require('../../../assets/images/exercises/standing-calf-raise.webp'),
  'incline-push-up': require('../../../assets/images/exercises/incline-push-up.webp'),
  'bulgarian-split-squat': require('../../../assets/images/exercises/bulgarian-split-squat.webp'),
  'split-squat': require('../../../assets/images/exercises/split-squat.webp'),
  'jump-squat': require('../../../assets/images/exercises/jump-squat.webp'),
  'mountain-climber': require('../../../assets/images/exercises/mountain-climber.webp'),
  'reverse-crunch': require('../../../assets/images/exercises/reverse-crunch.webp'),
  'side-plank': require('../../../assets/images/exercises/side-plank.webp'),
  'flutter-kick': require('../../../assets/images/exercises/flutter-kick.webp'),
  'burpee': require('../../../assets/images/exercises/burpee.webp'),
  'sit-up': require('../../../assets/images/exercises/sit-up.webp'),
};

export function ExerciseThumbnail({
  exerciseId,
  size = 56,
}: {
  exerciseId: string;
  size?: number;
}) {
  const source = Object.prototype.hasOwnProperty.call(EXERCISE_IMAGES, exerciseId)
    ? EXERCISE_IMAGES[exerciseId]
    : undefined;
  return source ? (
    <Image
      source={source}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessible={false}
    />
  ) : (
    <DumbbellIcon color="#7893BB" size={Math.min(size, 28)} />
  );
}
