import type { ImageSourcePropType } from 'react-native';
import type { DayCover } from './types';

/**
 * Bundled day-card cover photos — one per focus type, generated via Replicate
 * (dark cinematic athletic shots, 640×640 ~30KB each). Kept OUT of plan.ts so the
 * split engine stays pure (asset-free) + unit-testable; screens import this to
 * resolve a day's `cover` key to its image.
 */
export const DAY_COVERS: Record<DayCover, ImageSourcePropType> = {
  chest: require('../../../assets/images/day-chest.jpg'),
  back: require('../../../assets/images/day-back.jpg'),
  legs: require('../../../assets/images/day-legs.jpg'),
  shoulders: require('../../../assets/images/day-shoulders.jpg'),
  core: require('../../../assets/images/day-core.jpg'),
  cardio: require('../../../assets/images/day-cardio.jpg'),
  fullbody: require('../../../assets/images/day-fullbody.jpg'),
  recovery: require('../../../assets/images/day-recovery.jpg'),
};

export const dayCover = (key: DayCover): ImageSourcePropType => DAY_COVERS[key];
