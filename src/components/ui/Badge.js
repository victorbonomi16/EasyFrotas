import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../../theme/tokens';

const TONES = {
  success: { bg: '#DCFCE7', text: '#166534' },
  warning: { bg: '#FEF3C7', text: '#92400E' },
  danger: { bg: '#FEE2E2', text: '#991B1B' },
  info: { bg: '#DBEAFE', text: '#1E3A8A' },
  neutral: { bg: '#E2E8F0', text: '#334155' },
};

export function Badge({ label, tone = 'neutral' }) {
  const palette = TONES[tone] ?? TONES.neutral;
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.text, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

export const statusToneMap = {
  disponivel: 'success',
  em_uso: 'warning',
  manutencao: 'danger',
  inativo: 'neutral',
  em_andamento: 'warning',
  finalizada: 'success',
  cancelada: 'danger',
  pendente: 'warning',
  visualizado: 'info',
  resolvido: 'success',
  gestor: 'info',
  utilizador: 'neutral',
};

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
});

