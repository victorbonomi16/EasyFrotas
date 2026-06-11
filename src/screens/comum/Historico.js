import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { FloatingCardModal } from '../../components/ui/FloatingCardModal';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { useAuth } from '../../context/useAuth';
import { listTrips } from '../../services/Viagens';
import { colors, radius, spacing } from '../../theme/tokens';
import { OCCURRENCE_STATUS, labels } from '../../utils/constants';
import { formatDistance } from '../../utils/formatters';

const DEFAULT_FILTER = 'all';

function formatDateInput(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatDateForFile(date = new Date()) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}${month}${day}_${hour}${minute}`;
}

function getDefaultPeriod() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 7);

  return {
    startText: formatDateInput(start),
    endText: formatDateInput(end),
  };
}

function parseDateInput(value) {
  const match = String(value ?? '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return null;
  }

  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

function getPeriodRange(startText, endText) {
  const start = parseDateInput(startText);
  const end = parseDateInput(endText);

  if (!start || !end) {
    return { error: 'Informe as datas no formato DD/MM/AAAA.' };
  }

  if (start.getTime() > end.getTime()) {
    return { error: 'A data inicial não pode ser maior que a data final.' };
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

function formatPeriodChip(startText, endText) {
  return `${startText.slice(0, 5)} - ${endText.slice(0, 5)}`;
}

function formatDateTimeLabel(value) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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

function formatDurationLabel(startedAt, endedAt) {
  if (!startedAt) {
    return '-';
  }

  const startMs = new Date(startedAt).getTime();
  const endMs = endedAt ? new Date(endedAt).getTime() : Date.now();

  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    return '-';
  }

  const totalMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes}min`;
  }

  return `${hours}h ${String(minutes).padStart(2, '0')}min`;
}

function formatKmNoUnit(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '-';
  }
  return Number(value).toLocaleString('pt-BR');
}

function resolveTripVisual(trip) {
  if (trip?.status === 'finalizada') {
    return {
      statusBg: '#A7F3D0',
      statusText: '#065F46',
      statusLabel: 'Finalizada',
      statusIcon: 'checkmark-circle',
    };
  }

  return {
    statusBg: '#E2E8F0',
    statusText: '#334155',
    statusLabel: labels.tripStatus[trip?.status] ?? trip?.status ?? 'Sem status',
    statusIcon: 'time',
  };
}

function hasOpenOccurrence(trip) {
  return Boolean(trip?.trip_occurrences?.some((item) => item.status !== OCCURRENCE_STATUS.RESOLVIDO));
}

function getOccurrenceDetails(trip) {
  const occurrences = Array.isArray(trip?.trip_occurrences) ? trip.trip_occurrences : [];
  return occurrences.find((item) => item.status !== OCCURRENCE_STATUS.RESOLVIDO) ?? occurrences[0] ?? null;
}

function formatTripDestination(trip) {
  const destination = String(trip?.destino ?? '').trim();
  return destination || 'Destino não informado';
}

function buildVehicleTitle(trip) {
  const model = String(trip?.vehicles?.modelo ?? '').trim();
  return model || 'Veículo';
}

function escapeCsvValue(value) {
  const text = String(value ?? '').replace(/\r?\n|\r/g, ' ').trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function buildTripsCsv(tripsToExport) {
  const columns = [
    'Data/Horário de início',
    'Data/Horário de fim',
    'KM inicial',
    'KM final',
    'Placa',
    'Destino',
    'Motorista',
  ];

  const rows = tripsToExport.map((trip) => [
    formatDateTimeLabel(trip.started_at),
    formatDateTimeLabel(trip.ended_at),
    formatKmNoUnit(trip.km_inicial),
    formatKmNoUnit(trip.km_final),
    trip.vehicles?.placa ?? '-',
    formatTripDestination(trip),
    trip.profiles?.nome ?? '-',
  ]);

  const csvLines = [
    columns.map(escapeCsvValue).join(';'),
    ...rows.map((row) => row.map(escapeCsvValue).join(';')),
  ];

  return `\ufeff${csvLines.join('\n')}`;
}

export function Historico() {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const defaultPeriod = useMemo(() => getDefaultPeriod(), []);
  const [periodStart, setPeriodStart] = useState(defaultPeriod.startText);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriod.endText);
  const [draftPeriodStart, setDraftPeriodStart] = useState(defaultPeriod.startText);
  const [draftPeriodEnd, setDraftPeriodEnd] = useState(defaultPeriod.endText);
  const [userFilter, setUserFilter] = useState(DEFAULT_FILTER);
  const [vehicleFilter, setVehicleFilter] = useState(DEFAULT_FILTER);
  const [activeFilter, setActiveFilter] = useState(null);
  const [activeDatePicker, setActiveDatePicker] = useState(null);
  const [trips, setTrips] = useState([]);
  const [filterTrips, setFilterTrips] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedTripId, setExpandedTripId] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  const selectedPeriodRange = useMemo(() => getPeriodRange(periodStart, periodEnd), [periodEnd, periodStart]);
  const selectedPeriodLabel = useMemo(() => formatPeriodChip(periodStart, periodEnd), [periodEnd, periodStart]);

  const loadTrips = useCallback(async () => {
    if (!profile) {
      return;
    }
    setIsLoading(true);
    try {
      if (selectedPeriodRange.error) {
        throw new Error(selectedPeriodRange.error);
      }

      const [visibleResult, optionsResult] = await Promise.all([
        listTrips({
          profile,
          startDate: selectedPeriodRange.startDate,
          endDate: selectedPeriodRange.endDate,
        }),
        listTrips({ profile, periodDays: null }),
      ]);

      if (visibleResult.error) {
        throw visibleResult.error;
      }
      if (optionsResult.error) {
        throw optionsResult.error;
      }

      setTrips(visibleResult.data ?? []);
      setFilterTrips(optionsResult.data ?? []);
    } catch (error) {
      Alert.alert('Erro no histórico', error.message);
    } finally {
      setIsLoading(false);
    }
  }, [profile, selectedPeriodRange.endDate, selectedPeriodRange.error, selectedPeriodRange.startDate]);

  useFocusEffect(
    useCallback(() => {
      loadTrips();
    }, [loadTrips]),
  );

  const summaryText =
    profile?.perfil === 'gestor'
      ? 'Você está vendo viagens de toda a empresa.'
      : 'Você está vendo apenas suas viagens.';
  const isGestor = profile?.perfil === 'gestor';

  const userOptions = useMemo(() => {
    const options = new Map();
    filterTrips.forEach((trip) => {
      const id = trip.user_id;
      if (!id) {
        return;
      }
      options.set(id, trip.profiles?.nome ?? 'Usuário');
    });

    return [
      { id: DEFAULT_FILTER, label: profile?.perfil === 'gestor' ? 'Todos os usuários' : 'Minhas viagens' },
      ...Array.from(options, ([id, label]) => ({ id, label })),
    ];
  }, [filterTrips, profile?.perfil]);

  const vehicleOptions = useMemo(() => {
    const options = new Map();
    filterTrips.forEach((trip) => {
      const id = trip.vehicle_id;
      if (!id) {
        return;
      }

      const vehicleName = buildVehicleTitle(trip);
      const vehiclePlate = trip.vehicles?.placa ? ` • ${trip.vehicles.placa}` : '';
      options.set(id, `${vehicleName}${vehiclePlate}`);
    });

    return [
      { id: DEFAULT_FILTER, label: 'Todos os veículos' },
      ...Array.from(options, ([id, label]) => ({ id, label })),
    ];
  }, [filterTrips]);

  const filteredTrips = useMemo(
    () =>
      trips.filter((trip) => {
        const matchesUser = userFilter === DEFAULT_FILTER || trip.user_id === userFilter;
        const matchesVehicle = vehicleFilter === DEFAULT_FILTER || trip.vehicle_id === vehicleFilter;
        return matchesUser && matchesVehicle;
      }),
    [trips, userFilter, vehicleFilter],
  );

  const selectedUserLabel = userOptions.find((item) => item.id === userFilter)?.label ?? userOptions[0]?.label ?? 'Todos';
  const selectedVehicleLabel =
    vehicleOptions.find((item) => item.id === vehicleFilter)?.label ?? vehicleOptions[0]?.label ?? 'Todos';

  const exportTrips = useCallback(async () => {
    if (!profile || profile.perfil !== 'gestor') {
      return;
    }

    if (isExporting) {
      return;
    }

    setIsExporting(true);
    try {
      const records = filteredTrips;

      if (records.length === 0) {
        Alert.alert('Nenhum registro encontrado', 'Não há viagens para exportar com os filtros selecionados.');
        return;
      }

      const sharingAvailable = await Sharing.isAvailableAsync();
      if (!sharingAvailable) {
        Alert.alert('Compartilhamento indisponível', 'Este dispositivo não permite compartilhar arquivos no momento.');
        return;
      }

      const csv = buildTripsCsv(records);
      const fileName = `historico_easy_frotas_${formatDateForFile()}.csv`;
      const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!baseDirectory) {
        throw new Error('Não foi possível preparar o arquivo para compartilhamento.');
      }
      const fileUri = `${baseDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Exportar histórico de viagens',
        UTI: 'public.comma-separated-values-text',
      });
    } catch (error) {
      Alert.alert('Erro ao exportar', error.message);
    } finally {
      setIsExporting(false);
    }
  }, [filteredTrips, isExporting, profile]);

  const activeFilterConfig = useMemo(() => {
    if (activeFilter === 'usuario') {
      return {
        title: 'Filtrar por usuário',
        selectedId: userFilter,
        options: userOptions,
        onSelect: (id) => {
          setUserFilter(id);
          setExpandedTripId(null);
        },
      };
    }

    if (activeFilter === 'veiculo') {
      return {
        title: 'Filtrar por veículo',
        selectedId: vehicleFilter,
        options: vehicleOptions,
        onSelect: (id) => {
          setVehicleFilter(id);
          setExpandedTripId(null);
        },
      };
    }

    return null;
  }, [activeFilter, userFilter, userOptions, vehicleFilter, vehicleOptions]);

  const applyPeriodFilter = useCallback(() => {
    const range = getPeriodRange(draftPeriodStart, draftPeriodEnd);
    if (range.error) {
      Alert.alert('Período inválido', range.error);
      return;
    }

    setPeriodStart(draftPeriodStart.trim());
    setPeriodEnd(draftPeriodEnd.trim());
    setExpandedTripId(null);
    setActiveFilter(null);
  }, [draftPeriodEnd, draftPeriodStart]);

  const selectedPickerValue = useMemo(() => {
    const draftValue = activeDatePicker === 'inicio' ? draftPeriodStart : draftPeriodEnd;
    return parseDateInput(draftValue) ?? new Date();
  }, [activeDatePicker, draftPeriodEnd, draftPeriodStart]);

  const handleNativeDateChange = useCallback(
    (event, selectedDate) => {
      if (event?.type === 'dismissed') {
        setActiveDatePicker(null);
        return;
      }

      if (selectedDate) {
        const formattedDate = formatDateInput(selectedDate);
        if (activeDatePicker === 'inicio') {
          setDraftPeriodStart(formattedDate);
        } else {
          setDraftPeriodEnd(formattedDate);
        }
      }

      setActiveDatePicker(null);
    },
    [activeDatePicker],
  );

  const content = useMemo(() => {
    if (filteredTrips.length === 0) {
      return (
        <EmptyState
          title="Nenhuma viagem encontrada"
          subtitle="Ajuste os filtros ou aguarde novas viagens serem registradas."
        />
      );
    }

    return filteredTrips.map((trip) => {
      const visual = resolveTripVisual(trip);
      const distanceLabel = formatDistanceShort(trip);
      const durationLabel = formatDurationLabel(trip.started_at, trip.ended_at);
      const vehicleTitle = buildVehicleTitle(trip);
      const vehiclePlate = trip.vehicles?.placa || '-';
      const driverName = trip.profiles?.nome ?? profile?.nome ?? '-';
      const destinationLabel = formatTripDestination(trip);
      const isExpanded = expandedTripId === trip.id;
      const hasAlert = hasOpenOccurrence(trip);
      const occurrence = getOccurrenceDetails(trip);
      const initialObservation = String(trip?.observacao_inicio ?? '').trim();

      return (
        <Pressable
          key={trip.id}
          accessibilityRole="button"
          onPress={() => setExpandedTripId((current) => (current === trip.id ? null : trip.id))}
          style={({ pressed }) => [pressed ? styles.tripCardPressed : null]}
        >
          <Card style={styles.tripCard}>
            <View style={styles.tripHeaderRow}>
              <View style={styles.tripTitleBlock}>
                <Text style={styles.tripPlate}>{vehiclePlate}</Text>
                <Text style={styles.tripVehicleName} numberOfLines={1}>
                  {vehicleTitle}
                </Text>
              </View>

              <View style={styles.statusArea}>
                {hasAlert ? (
                  <View style={styles.alertIndicator}>
                    <Ionicons name="warning" size={15} color="#B91C1C" />
                  </View>
                ) : null}
                <View style={[styles.statusPill, { backgroundColor: visual.statusBg }]}>
                  <Ionicons name={visual.statusIcon} size={14} color={visual.statusText} />
                  <Text style={[styles.statusPillText, { color: visual.statusText }]}>
                    {visual.statusLabel.toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.peopleDestinationRow}>
              <InfoColumn icon="person-outline" label="Motorista" value={driverName} />
              <InfoColumn icon="location-outline" label="Destino" value={destinationLabel} />
            </View>

            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Ionicons name="git-compare-outline" size={18} color="#94A3B8" />
                <Text style={styles.summaryValue}>{distanceLabel}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Ionicons name="time-outline" size={18} color="#94A3B8" />
                <Text style={styles.summaryValue}>{durationLabel}</Text>
              </View>
              <Ionicons
                name={isExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                size={18}
                color="#94A3B8"
                style={styles.expandIcon}
              />
            </View>

            {isExpanded ? (
              <View style={styles.detailsBlock}>
                <View style={styles.detailsGrid}>
                  <MetricCell label="Hora inicial" value={formatHourLabel(trip.started_at)} />
                  <MetricCell label="Hora final" value={formatHourLabel(trip.ended_at)} />
                  <MetricCell label="KM inicial" value={formatKmNoUnit(trip.km_inicial)} />
                  <MetricCell label="KM final" value={formatKmNoUnit(trip.km_final)} />
                </View>

                <View style={styles.initialObservationRow}>
                  <Ionicons name="chatbox-ellipses-outline" size={16} color="#64748B" />
                  <View style={styles.initialObservationTextWrap}>
                    <Text style={styles.initialObservationLabel}>Observação inicial</Text>
                    <Text style={styles.initialObservationText}>
                      {initialObservation || 'Sem observação registrada.'}
                    </Text>
                  </View>
                </View>

                {occurrence ? (
                  <View style={styles.occurrenceDetail}>
                    <View style={styles.occurrenceTitleRow}>
                      <Ionicons name="alert-circle-outline" size={16} color="#B91C1C" />
                      <Text style={styles.occurrenceTitle}>
                        {labels.occurrenceType[occurrence.tipo] ?? 'Ocorrência'}
                      </Text>
                    </View>
                    <Text style={styles.occurrenceText}>
                      {occurrence.descricao || 'Ocorrência registrada sem observação.'}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </Card>
        </Pressable>
      );
    });
  }, [expandedTripId, filteredTrips, profile?.nome]);

  return (
    <View style={styles.root}>
      <ScreenContainer
        onRefresh={loadTrips}
        refreshing={isLoading}
        contentStyle={isGestor ? styles.contentWithFab : null}
      >
      <Card style={styles.filterCard}>
        <Text style={styles.title}>Histórico de viagens</Text>
        <Text style={styles.subtitle}>{summaryText}</Text>

        <View style={styles.filterGrid}>
          {isGestor ? (
            <>
              <FilterSelect
                value={userFilter === DEFAULT_FILTER ? 'Todos' : selectedUserLabel}
                icon="person-outline"
                onPress={() => setActiveFilter('usuario')}
              />
              <FilterSelect
                value={vehicleFilter === DEFAULT_FILTER ? 'Todos' : selectedVehicleLabel}
                icon="car-sport-outline"
                onPress={() => setActiveFilter('veiculo')}
              />
            </>
          ) : null}
          <FilterSelect
            value={selectedPeriodLabel}
            icon="calendar-outline"
            onPress={() => {
              setDraftPeriodStart(periodStart);
              setDraftPeriodEnd(periodEnd);
              setActiveFilter('periodo');
            }}
          />
          <FilterSelect
            value="LIMPAR"
            icon="refresh-outline"
            variant="clear"
            onPress={() => {
              setUserFilter(DEFAULT_FILTER);
              setVehicleFilter(DEFAULT_FILTER);
              setPeriodStart(defaultPeriod.startText);
              setPeriodEnd(defaultPeriod.endText);
              setDraftPeriodStart(defaultPeriod.startText);
              setDraftPeriodEnd(defaultPeriod.endText);
              setExpandedTripId(null);
            }}
          />
        </View>
      </Card>

      {content}

      <FloatingCardModal visible={Boolean(activeFilterConfig)} onRequestClose={() => setActiveFilter(null)}>
        <Card style={styles.optionsCard}>
          <Text style={styles.optionsTitle}>{activeFilterConfig?.title}</Text>

          <View style={styles.optionsList}>
            {activeFilterConfig?.options.map((option) => {
              const selected = option.id === activeFilterConfig.selectedId;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  onPress={() => {
                    activeFilterConfig.onSelect(option.id);
                    setActiveFilter(null);
                  }}
                  style={({ pressed }) => [
                    styles.optionRow,
                    selected ? styles.optionRowSelected : null,
                    pressed ? styles.optionRowPressed : null,
                  ]}
                >
                  <Text style={[styles.optionText, selected ? styles.optionTextSelected : null]}>
                    {option.label}
                  </Text>
                  {selected ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Card>
      </FloatingCardModal>

      <FloatingCardModal visible={activeFilter === 'periodo'} onRequestClose={() => setActiveFilter(null)}>
        <Card style={styles.optionsCard}>
          <Text style={styles.optionsTitle}>Filtrar por período</Text>

          <View style={styles.periodFields}>
            <View style={styles.periodField}>
              <Text style={styles.periodLabel}>Data inicial</Text>
              <DateSelectButton
                value={draftPeriodStart}
                onPress={() => setActiveDatePicker('inicio')}
              />
            </View>

            <View style={styles.periodField}>
              <Text style={styles.periodLabel}>Data final</Text>
              <DateSelectButton
                value={draftPeriodEnd}
                onPress={() => setActiveDatePicker('fim')}
              />
            </View>
          </View>

          <View style={styles.periodActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setActiveFilter(null)}
              style={({ pressed }) => [
                styles.periodActionButton,
                styles.periodCancelButton,
                pressed ? styles.optionRowPressed : null,
              ]}
            >
              <Text style={styles.periodCancelText}>Cancelar</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={applyPeriodFilter}
              style={({ pressed }) => [
                styles.periodActionButton,
                styles.periodApplyButton,
                pressed ? styles.optionRowPressed : null,
              ]}
            >
              <Text style={styles.periodApplyText}>Aplicar</Text>
            </Pressable>
          </View>
        </Card>
      </FloatingCardModal>

      {activeDatePicker ? (
        <DateTimePicker
          value={selectedPickerValue}
          mode="date"
          display="calendar"
          onChange={handleNativeDateChange}
        />
      ) : null}
      </ScreenContainer>

      {isGestor ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Exportar histórico"
          onPress={exportTrips}
          disabled={isExporting}
          style={({ pressed }) => [
            styles.exportFab,
            isExporting ? styles.exportFabLoading : null,
            { bottom: 78 + insets.bottom },
            pressed ? styles.exportFabPressed : null,
          ]}
        >
          <Ionicons name={isExporting ? 'hourglass-outline' : 'download-outline'} size={25} color="#FFFFFF" />
        </Pressable>
      ) : null}
    </View>
  );
}

function FilterSelect({ value, onPress, style, variant = 'default', icon = null }) {
  const isClear = variant === 'clear';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterSelect,
        isClear ? styles.filterSelectClear : null,
        style,
        pressed ? styles.filterSelectPressed : null,
      ]}
    >
      <View style={styles.filterSelectContent}>
        {icon ? (
          <Ionicons
            name={icon}
            size={15}
            color={isClear ? '#FFFFFF' : colors.primaryDark}
          />
        ) : null}
        <Text style={[styles.filterSelectValue, isClear ? styles.filterSelectValueClear : null]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </Pressable>
  );
}

function DateSelectButton({ value, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.periodInput, pressed ? styles.optionRowPressed : null]}
    >
      <Text style={styles.periodInputText}>{value}</Text>
      <Ionicons name="calendar-outline" size={19} color={colors.primaryDark} />
    </Pressable>
  );
}

function InfoColumn({ icon, label, value }) {
  return (
    <View style={styles.infoColumn}>
      <View style={styles.infoLabelRow}>
        <Ionicons name={icon} size={15} color="#64748B" />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
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
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentWithFab: {
    paddingBottom: 108,
  },
  filterCard: {
    gap: spacing.sm,
  },
  exportFab: {
    position: 'absolute',
    right: spacing.lg,
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.65)',
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
  },
  exportFabPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.97 }],
  },
  exportFabLoading: {
    opacity: 0.72,
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
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  filterSelect: {
    width: '48.7%',
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#DCE3EC',
    backgroundColor: '#EEF2F6',
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterSelectClear: {
    borderColor: colors.primaryDark,
    backgroundColor: colors.primaryDark,
  },
  filterSelectPressed: {
    opacity: 0.85,
  },
  filterSelectContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  filterSelectValue: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  filterSelectValueClear: {
    color: '#FFFFFF',
  },
  optionsCard: {
    gap: spacing.md,
  },
  optionsTitle: {
    color: colors.primaryDark,
    fontSize: 19,
    fontWeight: '900',
  },
  optionsList: {
    gap: spacing.xs,
  },
  optionRow: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E3E9F2',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  optionRowSelected: {
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
  },
  optionRowPressed: {
    opacity: 0.85,
  },
  optionText: {
    flex: 1,
    color: colors.primaryDark,
    fontSize: 15,
    fontWeight: '700',
  },
  optionTextSelected: {
    color: colors.primary,
    fontWeight: '900',
  },
  periodFields: {
    gap: spacing.sm,
  },
  periodField: {
    gap: spacing.xxs,
  },
  periodLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  periodInput: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E3E9F2',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  periodInputText: {
    color: colors.primaryDark,
    fontSize: 16,
    fontWeight: '900',
  },
  periodActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  periodActionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodCancelButton: {
    borderColor: '#DCE3EC',
    backgroundColor: '#F8FAFC',
  },
  periodApplyButton: {
    borderColor: colors.primaryDark,
    backgroundColor: colors.primaryDark,
  },
  periodCancelText: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: '800',
  },
  periodApplyText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  tripCard: {
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  tripCardPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  tripHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  tripTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  tripPlate: {
    color: colors.primaryDark,
    fontSize: 21,
    fontWeight: '900',
  },
  tripVehicleName: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  statusArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '900',
  },
  alertIndicator: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  peopleDestinationRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.xs,
  },
  infoColumn: {
    flex: 1,
    minWidth: 0,
  },
  infoLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  infoLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  infoValue: {
    color: colors.primaryDark,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 5,
  },
  summaryRow: {
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  summaryItem: {
    minWidth: 104,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  summaryValue: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '800',
  },
  summaryDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#DDE5EF',
  },
  expandIcon: {
    position: 'absolute',
    right: 0,
  },
  detailsBlock: {
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.sm,
    columnGap: spacing.xs,
  },
  metricCell: {
    width: '48%',
    gap: 2,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  metricValue: {
    color: colors.primaryDark,
    fontSize: 15,
    fontWeight: '900',
  },
  initialObservationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  initialObservationTextWrap: {
    flex: 1,
    gap: 2,
  },
  initialObservationLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  initialObservationText: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  occurrenceDetail: {
    borderTopWidth: 1,
    borderTopColor: '#EEF2F7',
    paddingTop: spacing.sm,
    gap: spacing.xxs,
  },
  occurrenceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  occurrenceTitle: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '800',
  },
  occurrenceText: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 20,
  },
});
