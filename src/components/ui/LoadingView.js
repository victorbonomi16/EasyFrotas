import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../theme/tokens';

export function LoadingView({ label = 'Carregando...' }) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  label: {
    color: colors.textMuted,
    fontSize: 14,
  },
});


