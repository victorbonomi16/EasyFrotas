import { StyleSheet, View } from 'react-native';

import { colors, radius, shadows, spacing } from '../../theme/tokens';

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#E5EAF1',
    padding: spacing.md,
    ...shadows.soft,
  },
});

