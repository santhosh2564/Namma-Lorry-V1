// Native placeholder until M3 adds MapView.native.tsx (mappls-map-react-native, dev build).
// Web uses MapView.web.tsx (Mappls Web SDK). Both share AppMapProps.
import { MapFallback } from './MapFallback';
import type { AppMapProps } from './types';
import { t } from '@/i18n';

export function MapView(props: AppMapProps) {
  return <MapFallback {...props} reason={t.map.nativePending} />;
}
