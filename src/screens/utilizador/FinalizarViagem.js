import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { useAuth } from '../../context/useAuth';
import { finishTrip, obterViagemAbertaPorUtilizador } from '../../services/Viagens';
import { colors, radius, shadows, spacing } from '../../theme/tokens';
import { OCCURRENCE_TYPES } from '../../utils/constants';
import { formatKm, sanitizeNumber } from '../../utils/formatters';

const occurrenceOptions = [
  { value: OCCURRENCE_TYPES.ABASTECIMENTO, label: 'Abastecimento', icon: 'water-outline' },
  { value: OCCURRENCE_TYPES.MANUTENCAO, label: 'Manutenção', icon: 'build-outline' },
  { value: OCCURRENCE_TYPES.OUTROS, label: 'Outros', icon: 'remove-outline' },
];

function formatCurrentHourLabel() {
  return new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function FinalizarViagem({ route, navigation }) {
  const { profile } = useAuth();
  const tripId = route.params?.tripId;
  const [trip, setTrip] = useState(null);
  const [kmFinal, setKmFinal] = useState('');
  const [occurrenceType, setOccurrenceType] = useState(null);
  const [occurrenceDescription, setOccurrenceDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingTrip, setIsLoadingTrip] = useState(false);

  const loadTrip = useCallback(async () => {
    if (!profile) {
      return;
    }

    setIsLoadingTrip(true);
    try {
      const { data, error } = await obterViagemAbertaPorUtilizador({
        idUtilizador: profile.id,
        empresaId: profile.empresa_id,
      });
      if (error) {
        throw error;
      }

      if (tripId && data && data.id !== tripId) {
        throw new Error('A viagem informada não está mais em andamento.');
      }

      setTrip(data ?? null);
      if (data?.km_inicial !== null && data?.km_inicial !== undefined) {
        setKmFinal(String(data.km_inicial));
      }
    } catch (error) {
      Alert.alert('Erro ao carregar viagem', error.message);
    } finally {
      setIsLoadingTrip(false);
    }
  }, [profile, tripId]);

  useFocusEffect(
    useCallback(() => {
      loadTrip();
    }, [loadTrip]),
  );

  const onFinish = async () => {
    if (!trip) {
      return;
    }

    const km = sanitizeNumber(kmFinal);
    if (km < Number(trip.km_inicial)) {
      Alert.alert('Quilometragem inválida', 'A quilometragem final deve ser maior ou igual à inicial.');
      return;
    }

    if (occurrenceType && !occurrenceDescription.trim()) {
      Alert.alert('Ocorrência incompleta', 'Descreva a ocorrência selecionada para encerrar a viagem.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await finishTrip({
        tripId: trip.id,
        kmFinal: km,
        observacaoFim: null,
        occurrenceType,
        occurrenceDescription: occurrenceDescription.trim(),
      });
      if (error) {
        throw error;
      }

      Alert.alert('Viagem encerrada', 'Registro finalizado com sucesso.');
      navigation.navigate('AbasPrincipais', { screen: 'Historico' });
    } catch (error) {
      Alert.alert('Falha ao encerrar', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!trip) {
    return (
      <ScreenContainer contentStyle={styles.container} safeEdges={['left', 'right', 'bottom']}>
        <View style={styles.emptyWrap}>
          <EmptyState
            title={isLoadingTrip ? 'Buscando viagem em andamento...' : 'Nenhuma viagem em andamento'}
            subtitle="Inicie uma viagem antes de acessar esta tela."
          />
          <PrimaryButton
            title="Ir para viagem em andamento"
            variant="outline"
            onPress={() => navigation.navigate('ViagemAtual')}
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer contentStyle={styles.container} safeEdges={['left', 'right', 'bottom']}>
      <Card style={styles.autoCaptureCard}>
        <Text style={styles.autoCaptureLabel}>Fim da Viagem (Captura Automática)</Text>
        <Text style={styles.autoCaptureValue}>Hoje, {formatCurrentHourLabel()}</Text>
      </Card>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>Odômetro</Text>
        <Card style={styles.odometerCard}>
          <View style={styles.kmReadonlyBox}>
            <Text style={styles.kmFieldLabel}>KM Inicial</Text>
            <Text style={styles.kmReadonlyValue}>{formatKm(trip.km_inicial)}</Text>
          </View>

          <View style={styles.kmInputBox}>
            <Text style={styles.kmFieldLabel}>KM Final *</Text>
            <TextInput
              value={kmFinal}
              onChangeText={setKmFinal}
              keyboardType="numeric"
              placeholder="Ex: 45280"
              placeholderTextColor={colors.textMuted}
              style={styles.kmInput}
            />
          </View>
        </Card>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>Ocorrências</Text>
        <Card style={styles.occurrenceCard}>
          <View style={styles.occurrencePills}>
            {occurrenceOptions.map((item) => {
              const selected = occurrenceType === item.value;
              return (
                <Pressable
                  key={item.value}
                  accessibilityRole="button"
                  onPress={() => {
                    const next = selected ? null : item.value;
                    setOccurrenceType(next);
                    if (!next) {
                      setOccurrenceDescription('');
                    }
                  }}
                  style={({ pressed }) => [
                    styles.occurrencePill,
                    selected ? styles.occurrencePillSelected : null,
                    pressed ? styles.occurrencePillPressed : null,
                  ]}
                >
                  <Ionicons
                    name={item.icon}
                    size={14}
                    color={selected ? '#065F46' : '#4B5563'}
                  />
                  <Text style={[styles.occurrencePillText, selected ? styles.occurrencePillTextSelected : null]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {occurrenceType ? (
            <View style={styles.occurrenceInputWrap}>
              <Text style={styles.occurrenceInputLabel}>Descrição da ocorrência</Text>
              <TextInput
                value={occurrenceDescription}
                onChangeText={setOccurrenceDescription}
                placeholder="Detalhes da ocorrência..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={4}
                style={styles.occurrenceInput}
              />
            </View>
          ) : null}
        </Card>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onFinish}
        disabled={isSubmitting}
        style={({ pressed }) => [
          styles.finishButton,
          {
            opacity: isSubmitting ? 0.65 : pressed ? 0.9 : 1,
            transform: [{ scale: pressed ? 0.99 : 1 }],
          },
        ]}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#E7FFF6" size="small" />
        ) : (
          <View style={styles.finishButtonInner}>
            <Ionicons name="checkmark-circle" size={18} color="#E7FFF6" />
            <Text style={styles.finishButtonText}>Encerrar e Salvar</Text>
          </View>
        )}
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.xs,
    gap: spacing.sm,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
  sectionBlock: {
    gap: spacing.xs,
  },
  sectionTitle: {
    color: '#5A6372',
    fontSize: 15,
    fontWeight: '800',
  },
  autoCaptureCard: {
    gap: spacing.xxs,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
  },
  autoCaptureLabel: {
    color: '#5B6472',
    fontSize: 14,
    fontWeight: '700',
  },
  autoCaptureValue: {
    color: colors.primaryDark,
    fontSize: 24 / 1.4,
    fontWeight: '900',
  },
  odometerCard: {
    gap: spacing.xs,
    borderRadius: radius.md,
    padding: spacing.xs,
  },
  kmReadonlyBox: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#E9EEF6',
    padding: spacing.sm,
    gap: spacing.xxs,
  },
  kmInputBox: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFD',
    padding: spacing.sm,
    gap: spacing.xxs,
  },
  kmFieldLabel: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  kmReadonlyValue: {
    color: colors.primaryDark,
    fontSize: 25 / 1.6,
    fontWeight: '800',
  },
  kmInput: {
    minHeight: 34,
    paddingVertical: 0,
    color: colors.primaryDark,
    fontSize: 24 / 1.5,
    fontWeight: '700',
  },
  occurrenceCard: {
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.xs,
  },
  occurrencePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  occurrencePill: {
    minHeight: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFD',
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  occurrencePillSelected: {
    borderColor: '#34D399',
    backgroundColor: '#A7F3D0',
  },
  occurrencePillPressed: {
    opacity: 0.85,
  },
  occurrencePillText: {
    color: '#4B5563',
    fontSize: 12,
    fontWeight: '700',
  },
  occurrencePillTextSelected: {
    color: '#065F46',
  },
  occurrenceInputWrap: {
    gap: spacing.xxs,
  },
  occurrenceInputLabel: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
  },
  occurrenceInput: {
    minHeight: 92,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFD',
    padding: spacing.sm,
    textAlignVertical: 'top',
    color: colors.text,
    fontSize: 14,
  },
  finishButton: {
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#047857',
    backgroundColor: '#047857',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.sm,
    ...shadows.soft,
  },
  finishButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  finishButtonText: {
    color: '#E7FFF6',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});

