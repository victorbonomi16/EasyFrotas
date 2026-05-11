import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { useAuth } from '../../context/useAuth';
import { listTrips } from '../../services/Viagens';
import { colors, radius, spacing } from '../../theme/tokens';
import { OCCURRENCE_STATUS, labels } from '../../utils/constants';
import { formatDistance } from '../../utils/formatters';

const PERIODS = [7, 30, 90];

function formatDateLabel(value) {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatHourLabel(value) {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDistanceShort(trip) {
  if (trip?.distancia_total !== null && trip?.distancia_total !== undefined) {
    const numeric = Number(trip.distancia_total);
    if (!Number.isNaN(numeric)) {
      return `${numeric.toLocaleString('pt-BR')} km`;
    }
  }
  return formatDistance(trip?.km_inicial, trip?.km_final);
}

function formatKmNoUnit(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '-';
  }
  return Number(value).toLocaleString('pt-BR');
}

function resolveTripVisual(trip) {
  const hasOpenOccurrence = Boolean(
    trip?.trip_occurrences?.some((item) => item.status !== OCCURRENCE_STATUS.RESOLVIDO),
  );

  if (hasOpenOccurrence) {
    return {
      statusBg: '#FEE2E2',
      statusText: '#991B1B',
      statusLabel: 'Alerta de ocorrência',
    };
  }

  if (trip?.status === 'finalizada') {
    return {
      statusBg: '#A7F3D0',
      statusText: '#065F46',
      statusLabel: 'Concluída',
    };
  }

  return {
    statusBg: '#E2E8F0',
    statusText: '#334155',
    statusLabel: labels.tripStatus[trip?.status] ?? trip?.status ?? 'Sem status',
  };
}

function firstOccurrence(trip) {
  if (!trip?.trip_occurrences?.length) {
    return null;
  }
  return trip.trip_occurrences[0];
}

export function Historico() {
  const { profile } = useAuth();
  const [periodDays, setPeriodDays] = useState(30);
  const [trips, setTrips] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadTrips = useCallback(async () => {
    if (!profile) {
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await listTrips({ profile, periodDays });
      if (error) {
        throw error;
      }
      setTrips(data ?? []);
    } catch (error) {
      Alert.alert('Erro no histórico', error.message);
    } finally {
      setIsLoading(false);
    }
  }, [periodDays, profile]);

  useFocusEffect(
    useCallback(() => {
      loadTrips();
    }, [loadTrips]),
  );

  const summaryText =
    profile?.perfil === 'gestor'
      ? 'Você está vendo viagens de toda a empresa.'
      : 'Você está vendo apenas suas viagens.';

  const content = useMemo(() => {
    if (trips.length === 0) {
      return (
        <EmptyState
          title="Nenhuma viagem encontrada"
          subtitle="Assim que uma viagem for iniciada e finalizada, ela aparecerá aqui."
        />
      );
    }

    return trips.map((trip) => {
      const visual = resolveTripVisual(trip);
      const occurrence = firstOccurrence(trip);
      const distanceLabel = formatDistanceShort(trip);
      const vehicleModel = trip.vehicles?.modelo || 'Veículo';
      const vehiclePlate = trip.vehicles?.placa || '-';

      return (
        <Card key={trip.id} style={styles.tripCard}>
          <View style={styles.topMetaRow}>
            <View style={styles.dateRow}>
              <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
              <Text style={styles.dateText}>{formatDateLabel(trip.started_at)}</Text>
            </View>

            <View style={[styles.statusPill, { backgroundColor: visual.statusBg }]}>
              <Ionicons name="checkmark-circle-outline" size={13} color={visual.statusText} />
              <Text style={[styles.statusPillText, { color: visual.statusText }]}>{visual.statusLabel}</Text>
            </View>
          </View>

          <View style={styles.vehicleRow}>
            <View style={styles.vehicleIcon}>
              <Ionicons name="car-sport-outline" size={16} color="#1E293B" />
            </View>
            <View style={styles.vehicleInfo}>
              <Text style={styles.vehicleModel}>
                {vehicleModel} {' ⬢ '} {vehiclePlate}
              </Text>
              <Text style={styles.vehicleSubline}>{trip.profiles?.nome ?? '-'}</Text>
            </View>
            <Text style={styles.distanceValue}>{distanceLabel}</Text>
          </View>

          {occurrence ? (
            <View style={styles.occurrenceBox}>
              <View style={styles.occurrenceTypeRow}>
                <Ionicons name="warning-outline" size={14} color="#DC2626" />
                <Text style={styles.occurrenceTypeText}>
                  {labels.occurrenceType[occurrence.tipo] ?? occurrence.tipo}
                </Text>
              </View>
              <Text style={styles.occurrenceDescription}>
                {occurrence.descricao || 'Ocorrência registrada sem descrição.'}
              </Text>
            </View>
          ) : null}

          <View style={styles.metricsRow}>
            <MetricCell label="Início" value={formatHourLabel(trip.started_at)} />
            <MetricCell label="Fim" value={formatHourLabel(trip.ended_at)} />
            <MetricCell label="KM Inicial" value={formatKmNoUnit(trip.km_inicial)} />
            <MetricCell label="KM Final" value={formatKmNoUnit(trip.km_final)} />
          </View>
        </Card>
      );
    });
  }, [trips]);

  return (
    <ScreenContainer onRefresh={loadTrips} refreshing={isLoading}>
      <Card style={styles.filterCard}>
        <Text style={styles.title}>Histórico de viagens</Text>
        <Text style={styles.subtitle}>{summaryText}</Text>

        <View style={styles.periodRow}>
          {PERIODS.map((days) => (
            <PrimaryButton
              key={days}
              title={`${days} dias`}
              variant={periodDays === days ? 'primary' : 'ghost'}
              onPress={() => setPeriodDays(days)}
              style={styles.periodButton}
            />
          ))}
        </View>
      </Card>

      {content}
    </ScreenContainer>
  );
}

function MetricCell({ label, value }) {
  return (
    <View style={styles.metricCell}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  filterCard: {
    gap: spacing.sm,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  periodRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  periodButton: {
    flex: 1,
    minHeight: 40,
  },
  tripCard: {
    gap: spacing.sm,
  },
  topMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  dateText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  statusPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  vehicleIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleModel: {
    color: colors.primaryDark,
    fontSize: 18,
    fontWeight: '800',
  },
  vehicleSubline: {
    color: '#475569',
    fontSize: 13,
    marginTop: 1,
  },
  distanceValue: {
    color: colors.primaryDark,
    fontSize: 16,
    fontWeight: '900',
  },
  occurrenceBox: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    padding: spacing.sm,
    gap: spacing.xxs,
  },
  occurrenceTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  occurrenceTypeText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '700',
  },
  occurrenceDescription: {
    color: '#7F1D1D',
    fontSize: 13,
    lineHeight: 18,
  },
  metricsRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  metricCell: {
    flex: 1,
    gap: 2,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  metricValue: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },
});

