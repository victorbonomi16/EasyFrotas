import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../../theme/tokens';
import { Card } from './Card';

function initialsFromName(name) {
  const source = String(name ?? '').trim();
  if (!source) {
    return 'GF';
  }

  const chunks = source.split(/\s+/).filter(Boolean);
  if (chunks.length >= 2) {
    return `${chunks[0][0]}${chunks[1][0]}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

export function ProfileWelcomeCard({ name, roleLabel, subtitle = '', onSignOut }) {
  return (
    <Card style={styles.card}>
      <View style={styles.topBar}>
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initialsFromName(name)}</Text>
          </View>

              <View style={styles.identityText}>
                <Text style={styles.greeting}>Olá, {name}</Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                <View style={styles.rolePill}>
                  <Text style={styles.rolePillText}>{roleLabel}</Text>
                </View>
              </View>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={onSignOut}
          style={({ pressed }) => [styles.logoutIconButton, pressed ? styles.iconPressed : null]}
        >
          <Ionicons name="log-out-outline" size={22} color={colors.primaryDark} />
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#D9E4F6',
    borderWidth: 1,
    borderColor: '#C5D4EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#223047',
    fontSize: 18,
    fontWeight: '800',
  },
  identityText: {
    flex: 1,
    gap: 3,
  },
  greeting: {
    color: colors.primaryDark,
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  rolePill: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    backgroundColor: '#D9E0F7',
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
  },
  rolePillText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  logoutIconButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D7DEE8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPressed: {
    opacity: 0.85,
  },
});

