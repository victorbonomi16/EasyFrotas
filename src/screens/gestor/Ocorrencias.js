import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ManagementHeaderCard } from '../../components/ui/ManagementHeaderCard';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { useAuth } from '../../context/useAuth';
import { listOccurrences, updateOccurrenceStatus } from '../../services/Ocorrencias';
import { colors, radius, shadows, spacing } from '../../theme/tokens';
import { OCCURRENCE_STATUS, OCCURRENCE_TYPES } from '../../utils/constants';

const TYPE_FILTERS = [
  { value: '', label: 'Todas' },
  { value: OCCURRENCE_TYPES.ABASTECIMENTO, label: 'Abastecimento' },
  { value: OCCURRENCE_TYPES.MANUTENCAO, label: 'Manutenção' },
  { value: OCCURRENCE_TYPES.OUTROS, label: 'Outros' },
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
  },
  [OCCURRENCE_STATUS.VISUALIZADO]: {
    label: 'Visualizado',
    bg: '#DBEAFE',
    text: '#1E3A8A',
  },
  [OCCURRENCE_STATUS.RESOLVIDO]: {
    label: 'Resolvido',
    bg: '#A7F3D0',
    text: '#065F46',
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
  const [typeFilter, setTypeFilter] = useState('');
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
    if (!typeFilter) {
      return items;
    }
    return items.filter((item) => item.tipo === typeFilter);
  }, [items, typeFilter]);

  const summary = useMemo(() => {
    const pendingCount = items.filter((item) => item.status === OCCURRENCE_STATUS.PENDENTE).length;
    const resolvedCount = items.filter((item) => item.status === OCCURRENCE_STATUS.RESOLVIDO).length;
    return {
      total: items.length,
      pendingCount,
      resolvedCount,
    };
  }, [items]);

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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {TYPE_FILTERS.map((filter) => {
            const selected = typeFilter === filter.value;
            return (
              <Pressable
                key={filter.value || 'all'}
                accessibilityRole="button"
                onPress={() => setTypeFilter(filter.value)}
                style={({ pressed }) => [
                  styles.filterChip,
                  selected ? styles.filterChipSelected : null,
                  pressed ? styles.filterChipPressed : null,
                ]}
              >
                <Text style={[styles.filterChipText, selected ? styles.filterChipTextSelected : null]}>
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
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
          const canVisualize = item.status === OCCURRENCE_STATUS.PENDENTE;
          const canResolve = item.status !== OCCURRENCE_STATUS.RESOLVIDO;

          const vehicleModel = item.trips?.vehicles?.modelo || 'Veículo';
          const vehiclePlate = item.trips?.vehicles?.placa || '-';

          return (
            <Card key={item.id} style={styles.occurrenceCard}>
              <View style={styles.cardTopRow}>
                <View style={styles.vehicleTitleRow}>
                  <Text style={styles.cardVehicle}>{vehicleModel}</Text>
                  <Ionicons name="ellipse" size={5} color="#64748B" />
                  <Text style={styles.cardPlate}>{vehiclePlate}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
                  <Text style={[styles.statusPillText, { color: status.text }]}>{status.label}</Text>
                </View>
              </View>

              <View style={styles.driverRow}>
                <Ionicons name="person" size={15} color="#6B7280" />
                <Text style={styles.driverName}>{item.trips?.profiles?.nome || '-'}</Text>
              </View>

              <View style={styles.messageBox}>
                <View style={styles.typeRow}>
                  <Ionicons name={type.icon} size={15} color="#4B5563" />
                  <Text style={styles.typeText}>{type.label}</Text>
                </View>
                <Text style={styles.descriptionText}>{item.descricao || 'Sem descrição adicional.'}</Text>
              </View>

              <View style={styles.cardFooter}>
                <Text style={styles.dateText}>{formatOccurrenceDate(item.created_at)}</Text>

                {item.status === OCCURRENCE_STATUS.RESOLVIDO ? (
                  <View style={styles.closedWrap}>
                    <Ionicons name="checkmark-done" size={16} color="#64748B" />
                    <Text style={styles.closedText}>Fechado</Text>
                  </View>
                ) : (
                  <View style={styles.actionButtons}>
                    {canVisualize ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => markAs(item, OCCURRENCE_STATUS.VISUALIZADO)}
                        disabled={isUpdating}
                        style={({ pressed }) => [
                          styles.visualizeButton,
                          pressed ? styles.buttonPressed : null,
                          isUpdating ? styles.buttonDisabled : null,
                        ]}
                      >
                        {isUpdating ? (
                          <ActivityIndicator size="small" color="#374151" />
                        ) : (
                          <>
                            <Ionicons name="eye-outline" size={15} color="#374151" />
                            <Text style={styles.visualizeButtonText}>Visualizar</Text>
                          </>
                        )}
                      </Pressable>
                    ) : null}

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
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  filterChip: {
    minHeight: 44,
    minWidth: 122,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#BFCADB',
    backgroundColor: '#D8E1EF',
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipSelected: {
    borderColor: '#0B1220',
    backgroundColor: '#0B1220',
  },
  filterChipPressed: {
    opacity: 0.88,
  },
  filterChipText: {
    color: '#1F2937',
    fontSize: 14,
    fontWeight: '700',
  },
  filterChipTextSelected: {
    color: '#FFFFFF',
  },
  occurrenceCard: {
    borderColor: '#C7D0DD',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    ...shadows.soft,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  vehicleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  cardVehicle: {
    color: colors.primaryDark,
    fontSize: 17,
    fontWeight: '800',
    maxWidth: '60%',
  },
  cardPlate: {
    color: colors.primaryDark,
    fontSize: 17,
    fontWeight: '800',
  },
  statusPill: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  driverName: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '500',
  },
  messageBox: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#D9E1ED',
    backgroundColor: '#F1F5F9',
    padding: spacing.sm,
    gap: spacing.xs,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  typeText: {
    color: '#4B5563',
    fontSize: 13,
    fontWeight: '600',
  },
  descriptionText: {
    color: '#1F2937',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  dateText: {
    flex: 1,
    color: '#1F2937',
    fontSize: 13,
    fontWeight: '500',
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
  visualizeButton: {
    minHeight: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#C9D2DE',
    backgroundColor: '#EFF3F9',
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xxs,
  },
  visualizeButtonText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '700',
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

