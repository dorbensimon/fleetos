// הסבר מודרך על מסך (במחשב בלבד)
import type { TourStep } from './tourTypes';

export type { TourStep };

// באפליקציה אין הסבר מודרך, האתר הוא המוצר
export function PageTour(_props: { steps: TourStep[]; onClose: () => void }) {
  return null;
}
