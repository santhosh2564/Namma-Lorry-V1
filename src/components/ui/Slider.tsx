import { MaterialIcons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { colors, radius, space } from '@/theme/tokens';

import { Text } from './Text';

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  testID?: string;
}

export const snap = (v: number, min: number, max: number, step: number) =>
  Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min));

/** Drag the track, tap −/+, or use the keyboard/screen-reader increment actions. */
export function Slider({ label, value, min, max, step, onChange, format = String, testID }: SliderProps) {
  const track = useRef<View>(null);
  const box = useRef({ x: 0, width: 1 });
  const pct = ((value - min) / (max - min)) * 100;

  function measure() {
    track.current?.measureInWindow((x, _y, width) => {
      box.current = { x, width: Math.max(1, width) };
    });
  }
  function fromEvent(e: GestureResponderEvent) {
    const ratio = (e.nativeEvent.pageX - box.current.x) / box.current.width;
    onChange(snap(min + ratio * (max - min), min, max, step));
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text variant="bodyStrong">{label}</Text>
        <Text variant="bodyStrong" style={styles.value}>
          {format(value)}
        </Text>
      </View>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          onPress={() => onChange(snap(value - step, min, max, step))}
          style={styles.step}
        >
          <MaterialIcons name="remove" size={20} color={colors.primary} />
        </Pressable>
        <View
          ref={track}
          testID={testID}
          onLayout={measure}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min, max, now: value, text: format(value) }}
          // react-native-web only exposes the value through aria-* props.
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={format(value)}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) =>
            onChange(snap(value + (e.nativeEvent.actionName === 'increment' ? step : -step), min, max, step))
          }
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => {
            measure();
            fromEvent(e);
          }}
          onResponderMove={fromEvent}
          style={styles.hit}
        >
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${pct}%` }]} />
          </View>
          <View style={[styles.thumb, { left: `${pct}%` }]} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          onPress={() => onChange(snap(value + step, min, max, step))}
          style={styles.step}
        >
          <MaterialIcons name="add" size={20} color={colors.primary} />
        </Pressable>
      </View>
      <View style={styles.ends}>
        <Text variant="caption" tone="secondary">
          {format(min)}
        </Text>
        <Text variant="caption" tone="secondary">
          {format(max)}
        </Text>
      </View>
    </View>
  );
}

const THUMB = 22;
const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  head: { flexDirection: 'row', justifyContent: 'space-between' },
  value: { fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  step: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hit: { flex: 1, height: 44, justifyContent: 'center', cursor: 'pointer' },
  track: { height: 6, borderRadius: radius.chip, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.accent },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    marginLeft: -THUMB / 2,
    borderRadius: THUMB / 2,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.accent,
  },
  ends: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 44 },
});
