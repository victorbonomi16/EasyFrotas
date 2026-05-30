import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../../theme/tokens';

export function ScreenContainer({
  children,
  scroll = true,
  contentStyle,
  safeEdges = ['top'],
  refreshing = false,
  onRefresh,
}) {
  const refreshControl = onRefresh ? (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
  ) : undefined;

  const content = scroll ? (
    <FlatList
      data={[{ key: 'content' }]}
      renderItem={() => <View style={[styles.content, contentStyle]}>{children}</View>}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
      style={styles.list}
    />
  ) : (
    <View style={[styles.content, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={safeEdges}>
      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
});