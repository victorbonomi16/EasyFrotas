import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, shadows, spacing } from '../../theme/tokens';

export function NfcPromptModal({
  visible,
  title = 'Aguardando TAG NFC',
  subtitle = 'Aproxime a TAG do celular para continuar.',
  cancelLabel = 'Cancelar',
  onCancel,
}) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) {
      pulse.setValue(1);
      return undefined;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.08,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [pulse, visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <Animated.View style={[styles.iconWrap, { transform: [{ scale: pulse }] }]}>
            <Ionicons name="radio-outline" size={38} color={colors.primaryDark} />
          </Animated.View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.hint}>Mantenha a TAG a 1-3 cm do aparelho.</Text>

          {onCancel ? (
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={({ pressed }) => [styles.cancelButton, pressed ? styles.cancelButtonPressed : null]}
            >
              <Text style={styles.cancelButtonText}>{cancelLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#D8E0EB',
    backgroundColor: '#FFFFFF',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadows.medium,
  },
  iconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1,
    borderColor: '#D7DEE8',
    backgroundColor: '#EFF4FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.primaryDark,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  cancelButton: {
    marginTop: spacing.xs,
    minHeight: 42,
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: '#CCD8E8',
    borderRadius: radius.md,
    backgroundColor: '#F8FAFD',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  cancelButtonPressed: {
    opacity: 0.85,
  },
  cancelButtonText: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: '800',
  },
});

