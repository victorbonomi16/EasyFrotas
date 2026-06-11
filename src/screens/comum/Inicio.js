import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ProfileWelcomeCard } from '../../components/ui/ProfileWelcomeCard';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { useAuth } from '../../context/useAuth';
import { getFleetSummary } from '../../services/Relatorios';
import { listTrips, obterViagemAbertaPorUtilizador } from '../../services/Viagens';
import { colors, radius, shadows, spacing } from '../../theme/tokens';
import { labels } from '../../utils/constants';
import { formatKm } from '../../utils/formatters';

const PERIODS = [7, 30, 90];

function buildUserSummary(trips = []) {
  const completedTrips = trips.filter((trip) => trip.status === 'finalizada');

  const totalDistance = completedTrips.reduce((total, trip) => {
    const distance = Number(trip?.distancia_total);
    if (Number.isFinite(distance) && distance > 0) {
      return total + distance;
    }

    const kmInicial = Number(trip?.km_inicial);
    const kmFinal = Number(trip?.km_final);
    if (Number.isFinite(kmInicial) && Number.isFinite(kmFinal) && kmFinal >= kmInicial) {
      return total + (kmFinal - kmInicial);
    }

    return total;
  }, 0);

  const openOccurrences = completedTrips.reduce((total, trip) => {
    const occurrences = Array.isArray(trip?.trip_occurrences) ? trip.trip_occurrences : [];
    const openCount = occurrences.filter((item) => item?.status !== 'resolvido').length;
    return total + openCount;
  }, 0);

  const totalTrips = completedTrips.length;
  const averageDistance = totalTrips > 0 ? totalDistance / totalTrips : 0;

  return {
    totalTrips,
    totalDistance,
    averageDistance,
    openOccurrences,
  };
}

function formatElapsedTime(startedAt, nowMs) {
  if (!startedAt) {
    return '00:00:00';
  }

  const startedMs = new Date(startedAt).getTime();
  if (Number.isNaN(startedMs)) {
    return '00:00:00';
  }

  const totalSeconds = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
}

function formatTripDate(value) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatTripHour(value) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Inicio() {
  const navigation = useNavigation();
  const { profile, signOut } = useAuth();
  const [openTrip, setOpenTrip] = useState(null);
  const [report, setReport] = useState(null);
  const [userSummary, setUserSummary] = useState({
    totalTrips: 0,
    totalDistance: 0,
    averageDistance: 0,
    openOccurrences: 0,
  });
  const [periodDays, setPeriodDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  const loadData = useCallback(async () => {
    if (!profile) {
      return;
    }

    setLoading(true);
    try {
      if (profile.perfil === 'gestor') {
        const { data: reportData, error: reportError } = await getFleetSummary({
          empresaId: profile.empresa_id,
          periodDays,
          vehicleId: null,
        });

        if (reportError) {
          throw reportError;
        }

        setReport(reportData ?? null);
      } else {
        const { data: openTripData, error: openTripError } = await obterViagemAbertaPorUtilizador({
          idUtilizador: profile.id,
          empresaId: profile.empresa_id,
        });

        if (openTripError) {
          throw openTripError;
        }

        setOpenTrip(openTripData ?? null);

        const { data: tripsData, error: tripsError } = await listTrips({
          profile,
          periodDays,
        });
        if (tripsError) {
          throw tripsError;
        }

        setUserSummary(buildUserSummary(tripsData ?? []));
      }
    } catch (error) {
      Alert.alert('Falha ao carregar dados', error.message);
    } finally {
      setLoading(false);
    }
  }, [periodDays, profile]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  useEffect(() => {
    if (!openTrip?.started_at) {
      return undefined;
    }

    const timerId = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(timerId);
  }, [openTrip?.started_at]);

  const isGestor = profile?.perfil === 'gestor';
  const elapsedLabel = useMemo(
    () => formatElapsedTime(openTrip?.started_at, nowMs),
    [nowMs, openTrip?.started_at],
  );

  if (!profile) {
    return null;
  }

  return (
    <ScreenContainer onRefresh={loadData} refreshing={loading}>
      {isGestor ? (
        <>
          <ProfileWelcomeCard
            name={profile.nome}
            roleLabel={labels.profile[profile.perfil]}
            onSignOut={signOut}
          />

          <Text style={styles.gestorSectionSubtitle}>Resumo Geral</Text>

          <Card style={styles.gestorFilterCard}>
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

          {!report ? (
            <EmptyState title={loading ? 'Carregando indicadores...' : 'Sem dados para o período selecionado'} />
          ) : (
            <>
              <View style={styles.metricGrid}>
                <MetricCell
                  label="Total de viagens"
                  value={report.total_trips ?? 0}
                  icon="car-outline"
                />
                <MetricCell
                  label="KM rodado"
                  value={formatKm(report.total_distance ?? 0)}
                  icon="speedometer-outline"
                />
                <MetricCell label="Ocorrências Totais" value={report.total_occurrences ?? 0} icon="alert-circle-outline" />
                <MetricCell
                  label="Ocorrências Abertas"
                  value={report.open_occurrences ?? 0}
                  icon="warning-outline"
                  danger
                />
              </View>

              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeaderTitle}>Veículos mais usados</Text>
                {(report.top_vehicles ?? []).length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => navigation.navigate('Veiculos')}
                    style={({ pressed }) => [styles.viewAllLink, pressed ? styles.iconPressed : null]}
                  >
                    <Text style={styles.viewAllLinkText}>Ver todos</Text>
                  </Pressable>
                ) : null}
              </View>
              <Card style={styles.topListCard}>
                {(report.top_vehicles ?? []).length === 0 ? (
                  <Text style={styles.emptyText}>Sem dados no período.</Text>
                ) : (
                  (report.top_vehicles ?? []).map((item, index) => (
                    <View
                      key={`${item.vehicle_id}-${index}`}
                      style={[styles.topListRow, index > 0 ? styles.topListRowBorder : null]}
                    >
                      <View style={styles.topListIconBubble}>
                        <Ionicons name="car-sport-outline" size={18} color="#2F6BDB" />
                      </View>
                      <View style={styles.topListTextWrap}>
                        <Text style={styles.topListPlate}>{item.placa}</Text>
                        <Text style={styles.topListModel}>{item.modelo}</Text>
                      </View>
                      <Text style={styles.topListKm}>{formatKm(item.total_distance)}</Text>
                    </View>
                  ))
                )}
              </Card>

              <Text style={styles.gestorSectionSubtitle}>Condutores com mais viagens</Text>
              <Card style={styles.topListCard}>
                {(report.top_users ?? []).length === 0 ? (
                  <Text style={styles.emptyText}>Sem dados no período.</Text>
                ) : (
                  (report.top_users ?? []).map((item, index) => (
                    <View
                      key={`${item.user_id}-${index}`}
                      style={[styles.topListRow, index > 0 ? styles.topListRowBorder : null]}
                    >
                      <View style={[styles.topListIconBubble, styles.utilizadorIconBubble]}>
                        <Ionicons name="person-outline" size={18} color="#334155" />
                      </View>
                      <View style={styles.topListTextWrap}>
                        <Text style={styles.topListPlate}>{item.nome}</Text>
                        <Text style={styles.topListModel}>{item.total_trips} viagens</Text>
                      </View>
                    </View>
                  ))
                )}
              </Card>
            </>
          )}
        </>
      ) : (
        <>
          <ProfileWelcomeCard
            name={profile.nome}
            roleLabel={labels.profile[profile.perfil]}
            onSignOut={signOut}
          />

          {openTrip ? (
            <>
              <View style={styles.activeTripExternalHeader}>
                <Text style={styles.activeTripExternalEyebrow}>Operacional</Text>
                <Text style={styles.gestorSectionSubtitle}>Viagem Atual</Text>
              </View>
              <Card style={styles.activeTripOuterCard}>
                <ActiveTripStatusCard
                  trip={openTrip}
                  elapsedLabel={elapsedLabel}
                  onFinish={() => navigation.navigate('ViagemAtual')}
                />
              </Card>
            </>
          ) : (
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>Status da sua viagem</Text>
              <View style={styles.tripInfo}>
                <Text style={styles.subtitle}>Nenhuma viagem em andamento no momento.</Text>
                <PrimaryButton title="Iniciar viagem" onPress={() => navigation.navigate('ViagemAtual')} />
              </View>
            </Card>
          )}

          <Text style={styles.gestorSectionSubtitle}>Resumo Geral</Text>
          <Card style={styles.gestorFilterCard}>
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
          <View style={styles.metricGrid}>
            <MetricCell
              label="Total de viagens"
              value={userSummary.totalTrips}
              icon="car-outline"
            />
            <MetricCell
              label="KM rodado"
              value={formatKm(userSummary.totalDistance)}
              icon="speedometer-outline"
            />
            <MetricCell
              label="Média por viagem"
              value={`${Math.round(userSummary.averageDistance)} Km`}
              icon="stats-chart-outline"
            />
            <MetricCell
              label="Ocorrências Abertas"
              value={userSummary.openOccurrences}
              icon="warning-outline"
              danger={userSummary.openOccurrences > 0}
            />
          </View>
        </>
      )}
    </ScreenContainer>
  );
}

function ActiveTripStatusCard({ trip, elapsedLabel, onFinish }) {
  const vehicle = trip?.vehicles ?? {};
  const vehicleTitle = vehicle.placa || 'Veículo em uso';
  const vehicleDetails = [vehicle.marca, vehicle.modelo].filter(Boolean).join(' • ');

  return (
    <View style={styles.activeTripCard}>
      <View style={styles.activeTripHeader}>
        <View style={styles.activeTripTitleWrap}>
          <Text style={styles.activeTripPlate}>{vehicleTitle}</Text>
          <Text style={styles.activeTripVehicle} numberOfLines={1}>
            {vehicleDetails || 'Veículo corporativo'}
          </Text>
        </View>
        <View style={styles.activeTripProgressPill}>
          <View style={styles.activeTripProgressDot} />
          <Text style={styles.activeTripProgressText}>Em progresso</Text>
        </View>
      </View>

      <View style={styles.activeTripInfoGrid}>
        <View style={styles.activeTripInfoBox}>
          <View style={styles.activeTripInfoLabelRow}>
            <Ionicons name="time-outline" size={14} color="#64748B" />
            <Text style={styles.activeTripInfoLabel}>Início</Text>
          </View>
          <Text style={styles.activeTripInfoValue}>{formatTripDate(trip.started_at)}</Text>
          <Text style={styles.activeTripInfoSubvalue}>{formatTripHour(trip.started_at)}</Text>
        </View>

        <View style={styles.activeTripInfoBox}>
          <View style={styles.activeTripInfoLabelRow}>
            <Ionicons name="speedometer-outline" size={14} color="#64748B" />
            <Text style={styles.activeTripInfoLabel}>KM inicial</Text>
          </View>
          <Text style={styles.activeTripInfoValue}>{formatKm(trip.km_inicial)}</Text>
          <Text style={styles.activeTripInfoSubvalue}>Odômetro</Text>
        </View>
      </View>

      <View style={styles.activeTripElapsedBox}>
        <View style={styles.activeTripElapsedIcon}>
          <Ionicons name="stopwatch-outline" size={22} color="#FFFFFF" />
        </View>
        <View style={styles.activeTripElapsedTextWrap}>
          <Text style={styles.activeTripElapsedLabel}>Tempo decorrido</Text>
          <Text style={styles.activeTripElapsedValue}>{elapsedLabel}</Text>
        </View>
        <Ionicons name="git-compare-outline" size={20} color="#16A36B" />
      </View>

      <PrimaryButton
        title="Finalizar viagem"
        onPress={onFinish}
        style={styles.activeTripFinishButton}
      />
    </View>
  );
}

function MetricCell({ label, value, icon, danger = false }) {
  return (
    <View style={styles.metricCell}>
      <View style={styles.metricTopRow}>
        <Ionicons name={icon} size={18} color={danger ? '#B42318' : '#475467'} />
        <Text
          numberOfLines={label === 'Ocorrências Abertas' ? 1 : undefined}
          style={[
            styles.metricLabel,
            label === 'Ocorrências Abertas' ? styles.metricLabelSingleLine : null,
            danger ? styles.metricLabelDanger : null,
          ]}
        >
          {label}
        </Text>
      </View>
      <Text style={[styles.metricValue, danger ? styles.metricValueDanger : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  iconPressed: {
    opacity: 0.85,
  },
  gestorFilterCard: {
    gap: spacing.xs,
    ...shadows.soft,
  },
  periodRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  periodButton: {
    flex: 1,
    minHeight: 40,
  },
  gestorSectionSubtitle: {
    color: colors.primaryDark,
    fontSize: 22,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  activeTripExternalHeader: {
    marginTop: spacing.xs,
    gap: 0,
  },
  activeTripExternalEyebrow: {
    color: '#475569',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: -2,
  },
  sectionHeaderRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionHeaderTitle: {
    color: colors.primaryDark,
    fontSize: 22,
    fontWeight: '700',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  metricCell: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#D7DEE8',
    borderRadius: radius.md,
    backgroundColor: '#FFFFFF',
    padding: spacing.sm,
    gap: spacing.xs,
    minHeight: 136,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  metricTopRow: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  metricLabel: {
    color: '#1F2937',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 140,
  },
  metricLabelSingleLine: {
    fontSize: 13,
    lineHeight: 18,
    maxWidth: 180,
  },
  metricLabelDanger: {
    color: '#B42318',
  },
  metricValue: {
    color: '#111827',
    fontSize: 34,
    fontWeight: '800',
    textAlign: 'center',
  },
  metricValueDanger: {
    color: '#B42318',
  },
  topListCard: {
    gap: 0,
    borderRadius: radius.md,
    borderColor: '#D7DEE8',
    overflow: 'hidden',
    ...shadows.soft,
  },
  topListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  topListRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#E5EAF2',
  },
  topListIconBubble: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E5EDFD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  utilizadorIconBubble: {
    backgroundColor: '#E9EEF5',
  },
  topListTextWrap: {
    flex: 1,
    gap: 2,
  },
  topListPlate: {
    color: '#111827',
    fontSize: 19,
    fontWeight: '700',
  },
  topListModel: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '500',
  },
  topListKm: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '600',
  },
  viewAllLink: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  viewAllLinkText: {
    color: '#1D4ED8',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    paddingVertical: spacing.md,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
  },
  card: {
    gap: spacing.sm,
    ...shadows.soft,
  },
  activeTripOuterCard: {
    padding: spacing.sm,
    gap: 0,
    borderColor: '#D7DEE8',
    ...shadows.soft,
  },
  cardTitle: {
    color: colors.primaryDark,
    fontSize: 18,
    fontWeight: '800',
  },
  activeTripCard: {
    gap: spacing.sm,
  },
  activeTripHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  activeTripTitleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  activeTripPlate: {
    color: colors.primaryDark,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  activeTripVehicle: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },
  activeTripProgressPill: {
    minHeight: 30,
    borderRadius: radius.pill,
    backgroundColor: '#DBEAFE',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  activeTripProgressDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#60A5FA',
  },
  activeTripProgressText: {
    color: '#2563EB',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  activeTripInfoGrid: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  activeTripInfoBox: {
    flex: 1,
    minHeight: 86,
    borderWidth: 1,
    borderColor: '#DDE5EF',
    borderRadius: radius.sm,
    backgroundColor: '#F8FAFC',
    padding: spacing.sm,
    justifyContent: 'center',
    gap: 2,
  },
  activeTripInfoLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  activeTripInfoLabel: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  activeTripInfoValue: {
    color: colors.primaryDark,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 2,
  },
  activeTripInfoSubvalue: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  activeTripElapsedBox: {
    minHeight: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#B7E5CC',
    backgroundColor: '#E8F8EF',
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  activeTripElapsedIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTripElapsedTextWrap: {
    flex: 1,
    gap: 1,
  },
  activeTripElapsedLabel: {
    color: '#047857',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  activeTripElapsedValue: {
    color: '#047857',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  activeTripFinishButton: {
    minHeight: 46,
  },
  tripInfo: {
    gap: spacing.xs,
  },
});

