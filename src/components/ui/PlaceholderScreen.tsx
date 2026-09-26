import { Text, View } from 'react-native';

type PlaceholderScreenProps = {
  screenId: string;
  title: string;
  milestone: string;
};

/**
 * Shared placeholder for every screen scaffolded in M1 (doc 12 screen list).
 * Replaced screen-by-screen from M5 onwards; real styling comes from
 * src/theme/tokens.ts in M2 (these inline colours are design-brief values).
 */
export function PlaceholderScreen({ screenId, title, milestone }: PlaceholderScreenProps) {
  return (
    <View
      testID={`placeholder-${screenId}`}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backgroundColor: '#F6F7F9',
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: 'bold',
          letterSpacing: 1,
          color: '#F5A300',
          marginBottom: 8,
        }}
      >
        {screenId}
      </Text>
      <Text
        style={{
          fontSize: 24,
          fontWeight: 'bold',
          color: '#0F2A44',
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: 14,
          color: '#5B6B7C',
          marginTop: 8,
          textAlign: 'center',
        }}
      >
        Coming in a later milestone ({milestone}).
      </Text>
    </View>
  );
}
