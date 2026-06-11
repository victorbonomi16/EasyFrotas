import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { FloatingCardModal } from '../../components/ui/FloatingCardModal';
import { ManagementHeaderCard } from '../../components/ui/ManagementHeaderCard';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { useAuth } from '../../context/useAuth';
import { listOccurrences, updateOccurrenceStatus } from '../../services/Ocorrencias';
import { colors, radius, shadows, spacing } from '../../theme/tokens';
import { OCCURRENCE_STATUS, OCCURRENCE_TYPES } from '../../utils/constants';

const DEFAULT_FILTER = 'all';

const TYPE_FILTERS = [
  { value: DEFAULT_FILTER, label: 'Todos os tipos' },
  { value: OCCURRENCE_TYPES.ABASTECIMENTO, label: 'Abastecimento' },
  { value: OCCURRENCE_TYPES.MANUTENCAO, label: 'Manutenção' },
  { value: OCCURRENCE_TYPES.OUTROS, label: 'Outros' },
];

const STATUS_FILTERS = [
  { value: DEFAULT_FILTER, label: 'Todos os status' },
  { value: 'pendente', label: 'Pendentes' },
  { value: OCCURRENCE_STATUS.RESOLVIDO, label: 'Resolvidos' },
];

const TYPE_META = {
  [OCCURRENCE_TYPES.ABASTECIMENTO]: {
    label: 'Abastecimento',
    icon: 'water-outline',
  },
  [OCCURRENCE_TYPES.MANUTENCAO]: {
    label: 'Manutenção',
    icon: 'build-outline',
  },
  [OCCURRENCE_TYPES.OUTROS]: {
    label: 'Outros',
    icon: 'alert-circle-outline',
  },
};

const STATUS_META = {
  [OCCURRENCE_STATUS.PENDENTE]: {
    label: 'Pendente',
    bg: '#FEE2E2',
    text: '#991B1B',
    icon: 'time',
  },
  [OCCURRENCE_STATUS.RESOLVIDO]: {
    label: 'Resolvido',
    bg: '#A7F3D0',
    text: '#065F46',
    icon: 'checkmark-circle',
  },
};

function formatOccurrenceDate(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const dateOnly = date.toLocaleDateString('pt-BR');
  const todayOnly = today.toLocaleDateString('pt-BR');
  const yesterdayOnly = yesterday.toLocaleDateString('pt-BR');

  const timeLabel = date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (dateOnly === todayOnly) {
    return `Hoje, ${timeLabel}`;
  }
  if (dateOnly === yesterdayOnly) {
    return `Ontem, ${timeLabel}`;
  }
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Ocorrencias() {
  const { profile } = useAuth();
  const [items, setItems] = useState([]);
  const [typeFilter, setTypeFilter] = useState(DEFAULT_FILTER);
  const [statusFilter, setStatusFilter] = useState('pendente');
  const [activeFilter, setActiveFilter] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [updatingById, setUpdatingById] = useState({});

  const loadItems = useCallback(async () => {
    if (!profile?.empresa_id) {
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await listOccurrences({
        empresaId: profile.empresa_id,
      });
      if (error) {
        throw error;
      }
      setItems(data ?? []);
    } catch (error) {
      Alert.alert('Erro ao carregar ocorrências', error.message);
    } finally {
      setIsLoading(false);
    }
  }, [profile?.empresa_id]);

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [loadItems]),
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesType = typeFilter === DEFAULT_FILTER || item.tipo === typeFilter;
      const matchesStatus =
        statusFilter === DEFAULT_FILTER ||
        (statusFilter === 'pendente' && item.status !== OCCURRENCE_STATUS.RESOLVIDO) ||
        item.status === statusFilter;

      return matchesType && matchesStatus;
    });
  }, [items, statusFilter, typeFilter]);

  const summary = useMemo(() => {
    const pendingCount = items.filter((item) => item.status === OCCURRENCE_STATUS.PENDENTE).length;
    const resolvedCount = items.filter((item) => item.status === OCCURRENCE_STATUS.RESOLVIDO).length;
    return {
      total: items.length,
      pendingCount,
      resolvedCount,
    };
  }, [items]);

  const selectedTypeLabel =
    typeFilter === DEFAULT_FILTER
      ? 'Todos'
      : TYPE_FILTERS.find((item) => item.value === typeFilter)?.label ?? 'Todos';

  const selectedStatusLabel =
    statusFilter === DEFAULT_FILTER
      ? 'Todos'
      : STATUS_FILTERS.find((item) => item.value === statusFilter)?.label ?? 'Todos';

  const activeFilterConfig = useMemo(() => {
    if (activeFilter === 'tipo') {
      return {
        title: 'Filtrar por tipo',
        selectedId: typeFilter,
        options: TYPE_FILTERS,
        onSelect: setTypeFilter,
      };
    }

    if (activeFilter === 'status') {
      return {
        title: 'Filtrar por status',
        selectedId: statusFilter,
        options: STATUS_FILTERS,
        onSelect: setStatusFilter,
      };
    }

    return null;
  }, [activeFilter, statusFilter, typeFilter]);

  const patchItemStatus = useCallback((id, nextStatus) => {
    setItems((old) =>
      old.map((item) => {
        if (item.id !== id) {
          return item;
        }
        return { ...item, status: nextStatus };
      }),
    );
  }, []);

  const markAs = async (item, status) => {
    if (item.status === status || updatingById[item.id]) {
      return;
    }

    const previousStatus = item.status;
    patchItemStatus(item.id, status);
    setUpdatingById((old) => ({ ...old, [item.id]: true }));

    try {
      const { error } = await updateOccurrenceStatus(item.id, status);
      if (error) {
        throw error;
      }
    } catch (error) {
      Alert.alert('Erro ao atualizar ocorrência', error.message);
      patchItemStatus(item.id, previousStatus);
    } finally {
      setUpdatingById((old) => {
        const next = { ...old };
        delete next[item.id];
        return next;
      });
    }
  };

  return (
    <ScreenContainer contentStyle={styles.container} safeEdges={['top', 'left', 'right', 'bottom']}>
      <ManagementHeaderCard
        title="Ocorrências"
        subtitle="Revise e gerencie os alertas reportados na frota."
        stats={[
          { label: 'Total', value: summary.total },
          { label: 'Pendentes', value: summary.pendingCount },
          { label: 'Resolvidos', value: summary.resolvedCount },
        ]}
      >
        <View style={styles.filterGrid}>
          <FilterSelect
            value={selectedTypeLabel}
            icon="options-outline"
            onPress={() => setActiveFilter('tipo')}
          />
          <FilterSelect
            value={selectedStatusLabel}
            icon="checkmark-circle-outline"
            onPress={() => setActiveFilter('status')}
          />
        </View>
      </ManagementHeaderCard>

      {isLoading && items.length === 0 ? (
        <EmptyState title="Carregando ocorrências..." />
      ) : filteredItems.length === 0 ? (
        <EmptyState title="Nenhuma ocorrência para este filtro" />
      ) : (
        filteredItems.map((item) => {
          const type = TYPE_META[item.tipo] ?? TYPE_META[OCCURRENCE_TYPES.OUTROS];
          const status = STATUS_META[item.status] ?? STATUS_META[OCCURRENCE_STATUS.PENDENTE];
          const isUpdating = Boolean(updatingById[item.id]);
          const canResolve = item.status !== OCCURRENCE_STATUS.RESOLVIDO;

          const vehicleModel = item.trips?.vehicles?.modelo || 'Veículo';
          const vehiclePlate = item.trips?.vehicles?.placa || '-';

          return (
            <Card key={item.id} style={styles.occurrenceCard}>
              <View style={styles.occurrenceHeaderRow}>
                <View style={styles.occurrenceTitleBlock}>
                  <Text style={styles.occurrencePlate}>{vehiclePlate}</Text>
                  <Text style={styles.occurrenceVehicleName} numberOfLines={1}>
                    {vehicleModel}
                  </Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
                  <Ionicons name={status.icon} size={14} color={status.text} />
                  <Text style={[styles.statusPillText, { color: status.text }]}>
                    {status.label.toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={styles.occurrenceInfoRow}>
                <OccurrenceInfoColumn
                  icon="person-outline"
                  label="Motorista"
                  value={item.trips?.profiles?.nome || '-'}
                />
                <OccurrenceInfoColumn
                  icon={type.icon}
                  label="Ocorrência"
                  value={type.label}
                />
              </View>

              <View style={styles.occurrenceDetailRow}>
                <Ionicons name="chatbox-ellipses-outline" size={16} color="#64748B" />
                <View style={styles.occurrenceDetailTextWrap}>
                  <Text style={styles.occurrenceDetailLabel}>Detalhes da ocorrência</Text>
                  <Text style={styles.occurrenceDetailText}>
                    {item.descricao || 'Sem descrição adicional.'}
                  </Text>
                </View>
              </View>

              <View style={styles.cardFooter}>
                <View style={styles.dateRow}>
                  <Ionicons name="calendar-outline" size={15} color="#64748B" />
                  <Text style={styles.dateText}>{formatOccurrenceDate(item.created_at)}</Text>
                </View>

                {item.status === OCCURRENCE_STATUS.RESOLVIDO ? (
                  <View style={styles.closedWrap}>
                    <Ionicons name="checkmark-done" size={16} color="#64748B" />
                    <Text style={styles.closedText}>Fechado</Text>
                  </View>
                ) : (
                  <View style={styles.actionButtons}>
                    {canResolve ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => markAs(item, OCCURRENCE_STATUS.RESOLVIDO)}
                        disabled={isUpdating}
                        style={({ pressed }) => [
                          styles.resolveButton,
                          pressed ? styles.buttonPressed : null,
                          isUpdating ? styles.buttonDisabled : null,
                        ]}
                      >
                        {isUpdating ? (
                          <ActivityIndicator size="small" color="#E7FFF6" />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle" size={16} color="#E7FFF6" />
                            <Text style={styles.resolveButtonText}>Resolver</Text>
                          </>
                        )}
                      </Pressable>
                    ) : null}
                  </View>
                )}
              </View>
            </Card>
          );
        })
      )}

      <FloatingCardModal visible={Boolean(activeFilterConfig)} onRequestClose={() => setActiveFilter(null)}>
        <Card style={styles.optionsCard}>
          <Text style={styles.optionsTitle}>{activeFilterConfig?.title}</Text>

          <View style={styles.optionsList}>
            {activeFilterConfig?.options.map((option) => {
              const selected = option.value === activeFilterConfig.selectedId;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  onPress={() => {
                    activeFilterConfig.onSelect(option.value);
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
    </ScreenContainer>
  );
}

function FilterSelect({ value, onPress, icon }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.filterSelect, pressed ? styles.filterSelectPressed : null]}
    >
      <View style={styles.filterSelectContent}>
        <Ionicons name={icon} size={15} color={colors.primaryDark} />
        <Text style={styles.filterSelectValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </Pressable>
  );
}

function OccurrenceInfoColumn({ icon, label, value }) {
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

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.sm,
    gap: spacing.md,
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
  occurrenceCard: {
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.soft,
  },
  occurrenceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  occurrenceTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  occurrencePlate: {
    color: colors.primaryDark,
    fontSize: 21,
    fontWeight: '900',
  },
  occurrenceVehicleName: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
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
  occurrenceInfoRow: {
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
    gap: spacing.xs,
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
  occurrenceDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  occurrenceDetailTextWrap: {
    flex: 1,
    gap: 2,
  },
  occurrenceDetailLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  occurrenceDetailText: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: '#EEF2F7',
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  dateRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dateText: {
    flex: 1,
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
  closedWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  closedText: {
    color: '#4B5563',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  resolveButton: {
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#047857',
    backgroundColor: '#047857',
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xxs,
  },
  resolveButtonText: {
    color: '#E7FFF6',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
});

