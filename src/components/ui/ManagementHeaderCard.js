import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../../theme/tokens';
import { Card } from './Card';
import { PrimaryButton } from './PrimaryButton';
import { TextField } from './TextField';

export function ManagementHeaderCard({
  title,
  subtitle,
  stats = [],
  searchLabel,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  onSearchPress,
  searchLoading = false,
  searchActionLabel = 'Pesquisar',
  createLabel,
  onCreatePress,
  children,
}) {
  return (
    <Card style={styles.headerCard}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      {stats.length > 0 ? (
        <View style={styles.kpis}>
          {stats.map((item) => (
            <View key={item.label} style={styles.infoPill}>
              <Text style={styles.infoPillLabel}>{item.label}</Text>
              <Text style={styles.infoPillValue}>{item.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {searchLabel ? (
        <TextField
          label={searchLabel}
          value={searchValue}
          onChangeText={onSearchChange}
          placeholder={searchPlaceholder}
        />
      ) : null}

      {onSearchPress || onCreatePress ? (
        <View style={styles.headerActions}>
          {onSearchPress ? (
            <PrimaryButton
              title={searchActionLabel}
              variant="outline"
              onPress={onSearchPress}
              loading={searchLoading}
              style={styles.flexButton}
            />
          ) : null}
          {onCreatePress && createLabel ? (
            <PrimaryButton title={createLabel} onPress={onCreatePress} style={styles.flexButton} />
          ) : null}
        </View>
      ) : null}

      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    gap: spacing.sm,
  },
  title: {
    color: colors.primaryDark,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  kpis: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  infoPill: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F9FBFF',
    paddingVertical: spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  infoPillLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  infoPillValue: {
    color: colors.primaryDark,
    fontSize: 17,
    fontWeight: '800',
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  flexButton: {
    flex: 1,
  },
});

