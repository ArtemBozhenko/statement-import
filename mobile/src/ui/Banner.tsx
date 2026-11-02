import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { Tone } from '@/import/presentation';
import { useTheme } from '@/theme';
import { Text } from '@/ui/Text';

/** Status block: tone-colored stripe on the left, title, explanation, indicator. Live region for the screen reader. */
export interface BannerProps {
  tone: Tone;
  title: string;
  body?: string;
  busy?: boolean;
  hint?: string | null;
  testID?: string;
}

export function Banner({ tone, title, body, busy = false, hint, testID }: BannerProps) {
  const theme = useTheme();
  const toneColor = { info: theme.colors.accent, success: theme.colors.success, warning: theme.colors.warning, danger: theme.colors.danger }[tone];

  return (
    <View
      testID={testID}
      accessibilityLiveRegion="polite"
      style={[styles.container, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderLeftColor: toneColor, borderRadius: theme.radius, padding: theme.spacing.lg, gap: theme.spacing.sm }]}
    >
      <View style={[styles.titleRow, { gap: theme.spacing.sm }]}>
        {busy ? <ActivityIndicator size="small" color={toneColor} /> : null}
        <Text style={[theme.type.heading, styles.title, { color: theme.colors.text }]}>{title}</Text>
      </View>
      {body ? <Text style={[theme.type.body, { color: theme.colors.textMuted }]}>{body}</Text> : null}
      {hint ? <Text style={[theme.type.caption, { color: theme.colors.warning }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: StyleSheet.hairlineWidth, borderLeftWidth: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { flexShrink: 1 },
});
