import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Badge, statusToneMap } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { FloatingCardModal } from '../../components/ui/FloatingCardModal';
import { ManagementHeaderCard } from '../../components/ui/ManagementHeaderCard';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../context/useAuth';
import { removeVehiclePhotoByPublicUrl, uploadVehiclePhoto } from '../../services/Armazenamento';
import { listVehicles, saveVehicle, setVehicleStatus } from '../../services/Veiculos';
import { colors, radius, shadows, spacing } from '../../theme/tokens';
import { labels, VEHICLE_STATUS } from '../../utils/constants';
import { formatKm, sanitizeNumber } from '../../utils/formatters';

const baseForm = {
  id: null,
  placa: '',
  modelo: '',
  marca: '',
  ano: '',
  cor: '',
  foto_url: '',
  km_atual: '',
  status: VEHICLE_STATUS.DISPONIVEL,
};

const EDITABLE_VEHICLE_STATUS = [VEHICLE_STATUS.DISPONIVEL, VEHICLE_STATUS.MANUTENCAO];

function sanitizeVehiclePlateInput(value) {
  return String(value ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function sanitizeNumericInput(value, maxLength) {
  return String(value ?? '').replace(/\D/g, '').slice(0, maxLength);
}

export function Veiculos() {
  const navigation = useNavigation();
  const { profile } = useAuth();
  const { height: windowHeight } = useWindowDimensions();
  const formModalMaxHeight = Math.max(520, windowHeight * 0.9);
  const formScrollMaxHeight = Math.min(620, Math.max(360, windowHeight * 0.62));
  const [vehicles, setVehicles] = useState([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPickingPhoto, setIsPickingPhoto] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState(baseForm);
  const [showPhotoRemoveAction, setShowPhotoRemoveAction] = useState(false);

  const loadVehicles = useCallback(async () => {
    if (!profile?.empresa_id) {
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await listVehicles({
        empresaId: profile.empresa_id,
        search: search.trim(),
      });
      if (error) {
        throw error;
      }
      setVehicles(data ?? []);
    } catch (error) {
      Alert.alert('Erro ao carregar veículos', error.message);
    } finally {
      setIsLoading(false);
    }
  }, [profile?.empresa_id, search]);

  useFocusEffect(
    useCallback(() => {
      loadVehicles();
    }, [loadVehicles]),
  );

  const closeModal = () => {
    setModalVisible(false);
    setForm(baseForm);
    setShowPhotoRemoveAction(false);
  };

  const openCreateModal = () => {
    setForm(baseForm);
    setShowPhotoRemoveAction(false);
    setModalVisible(true);
  };

  const openEditModal = (vehicle) => {
    if (vehicle.status === VEHICLE_STATUS.INATIVO) {
      Alert.alert('Veículo inativo', 'Reative o veículo antes de editar as informações cadastrais.');
      return;
    }

    setForm({
      ...vehicle,
      foto_url: vehicle.foto_url ?? '',
      km_atual: String(vehicle.km_atual ?? ''),
      ano: String(vehicle.ano ?? ''),
    });
    setShowPhotoRemoveAction(false);
    setModalVisible(true);
  };

  const ensureGalleryPermission = async () => {
    const currentPermission = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (currentPermission.granted) {
      return true;
    }

    const requestedPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return Boolean(requestedPermission.granted);
  };

  const pickAndUploadPhoto = async () => {
    if (!profile?.empresa_id) {
      Alert.alert('Empresa não identificada', 'Não foi possível associar a imagem à empresa.');
      return;
    }

    try {
      setIsPickingPhoto(true);

      const hasPermission = await ensureGalleryPermission();
      if (!hasPermission) {
        Alert.alert('Permissão necessária', 'Permita acesso à galeria para selecionar a foto do veículo.');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.75,
        selectionLimit: 1,
      });

      if (pickerResult.canceled) {
        return;
      }

      const selectedAsset = pickerResult.assets?.[0];
      if (!selectedAsset) {
        return;
      }

      setIsUploadingPhoto(true);
      const uploadResult = await uploadVehiclePhoto({
        empresaId: profile.empresa_id,
        vehicleId: form.id,
        asset: selectedAsset,
      });

      if (form.foto_url) {
        await removeVehiclePhotoByPublicUrl(form.foto_url);
      }

      setForm((old) => ({ ...old, foto_url: uploadResult.publicUrl }));
      setShowPhotoRemoveAction(false);
    } catch (error) {
      Alert.alert('Erro no upload', error.message);
    } finally {
      setIsPickingPhoto(false);
      setIsUploadingPhoto(false);
    }
  };

  const clearPhoto = async () => {
    if (!form.foto_url) {
      return;
    }

    setIsUploadingPhoto(true);
    try {
      await removeVehiclePhotoByPublicUrl(form.foto_url);
      setForm((old) => ({ ...old, foto_url: '' }));
      setShowPhotoRemoveAction(false);
    } catch (error) {
      Alert.alert('Erro ao remover foto', error.message);
    } finally {
      setIsUploadingPhoto(false);
    }
  };
  const onPhotoPress = async () => {
    if (isPickingPhoto || isUploadingPhoto) {
      return;
    }

    if (!form.foto_url) {
      await pickAndUploadPhoto();
      return;
    }

    setShowPhotoRemoveAction((old) => !old);
  };

  const onSave = async () => {
    const normalizedPlate = sanitizeVehiclePlateInput(form.placa);
    const kmAtual = sanitizeNumber(form.km_atual);
    const anoVeiculo = form.ano ? Number(form.ano) : null;

    if (!normalizedPlate || !form.modelo.trim()) {
      Alert.alert('Campos obrigatórios', 'Informe ao menos placa e modelo.');
      return;
    }
    if (normalizedPlate.length !== 7) {
      Alert.alert('Placa inválida', 'A placa deve conter exatamente 7 letras ou números.');
      return;
    }
    if (form.ano && (!Number.isInteger(anoVeiculo) || String(form.ano).length !== 4)) {
      Alert.alert('Ano inválido', 'Informe o ano com 4 dígitos.');
      return;
    }
    if (kmAtual < 0) {
      Alert.alert('Quilometragem inválida', 'A quilometragem não pode ser negativa.');
      return;
    }
    if (form.id && form.status === VEHICLE_STATUS.INATIVO) {
      Alert.alert('Status inválido', 'Use a opção de inativar no card do veículo para alterar esse status.');
      return;
    }
    if (!profile?.empresa_id) {
      Alert.alert('Empresa não identificada', 'Não foi possível associar este cadastro à empresa.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        ...form,
        placa: normalizedPlate,
        modelo: form.modelo.trim(),
        marca: form.marca.trim() || null,
        cor: form.cor.trim() || null,
        foto_url: form.foto_url?.trim() || null,
        km_atual: kmAtual,
        ano: anoVeiculo,
        status: form.id ? form.status : VEHICLE_STATUS.DISPONIVEL,
        empresa_id: profile.empresa_id,
      };

      const { error } = await saveVehicle(payload);
      if (error) {
        throw error;
      }

      Alert.alert('Sucesso', `Veículo ${form.id ? 'atualizado' : 'cadastrado'} com sucesso.`);
      closeModal();
      loadVehicles();
    } catch (error) {
      Alert.alert('Erro ao salvar veículo', error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const onToggleVehicleStatus = async (vehicle) => {
    const willInactivate = vehicle.status !== VEHICLE_STATUS.INATIVO;
    const nextStatus = willInactivate ? VEHICLE_STATUS.INATIVO : VEHICLE_STATUS.DISPONIVEL;
    const actionLabel = willInactivate ? 'inativar' : 'reativar';

    if (willInactivate && vehicle.status === VEHICLE_STATUS.EM_USO) {
      Alert.alert(
        'Veículo em uso',
        'Não é possível inativar um veículo com viagem em andamento. Finalize a viagem antes de inativar.',
      );
      return;
    }

    Alert.alert(
      willInactivate ? 'Inativar veículo' : 'Reativar veículo',
      `Deseja ${actionLabel} o veículo ${vehicle.placa}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: willInactivate ? 'Inativar' : 'Reativar',
          style: willInactivate ? 'destructive' : 'default',
          onPress: async () => {
            const { error } = await setVehicleStatus(vehicle.id, nextStatus);
            if (error) {
              Alert.alert('Erro', error.message);
              return;
            }
            loadVehicles();
          },
        },
      ],
      { cancelable: true },
    );
  };

  const fleetInfo = useMemo(() => {
    const activeCount = vehicles.filter((item) => item.status !== VEHICLE_STATUS.INATIVO).length;
    return {
      total: vehicles.length,
      activeCount,
      inactiveCount: vehicles.length - activeCount,
    };
  }, [vehicles]);

  const sortedVehicles = useMemo(
    () =>
      [...vehicles].sort((first, second) => {
        const firstInactive = first.status === VEHICLE_STATUS.INATIVO;
        const secondInactive = second.status === VEHICLE_STATUS.INATIVO;

        if (firstInactive === secondInactive) {
          return 0;
        }

        return firstInactive ? 1 : -1;
      }),
    [vehicles],
  );

  return (
    <ScreenContainer>
      <ManagementHeaderCard
        title="Frota"
        stats={[
          { label: 'Total', value: fleetInfo.total },
          { label: 'Ativos', value: fleetInfo.activeCount },
          { label: 'Inativos', value: fleetInfo.inactiveCount },
        ]}
        searchLabel="Buscar por placa, modelo ou marca"
        searchPlaceholder="Ex: ABC1234"
        searchValue={search}
        onSearchChange={setSearch}
        onSearchPress={loadVehicles}
        searchLoading={isLoading}
        createLabel="Novo veículo"
        onCreatePress={openCreateModal}
      />

      {vehicles.length === 0 ? (
        <EmptyState title="Nenhum veículo cadastrado" subtitle="Cadastre o primeiro veículo para iniciar o controle da frota." />
      ) : (
        sortedVehicles.map((vehicle) => (
          <Card
            key={vehicle.id}
            style={[
              styles.vehicleCard,
              vehicle.status === VEHICLE_STATUS.INATIVO ? styles.vehicleCardInactive : null,
            ]}
          >
            <View style={styles.vehicleImageArea}>
              <VehicleImage sourceUrl={vehicle.foto_url} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Editar veículo ${vehicle.placa}`}
                onPress={() => openEditModal(vehicle)}
                style={({ pressed }) => [
                  styles.editImageButton,
                  pressed ? styles.editImageButtonPressed : null,
                ]}
              >
                <Ionicons name="pencil-outline" size={17} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.vehicleHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.vehiclePlate}>{vehicle.placa}</Text>
                <Text style={styles.vehicleModel}>{vehicle.modelo}</Text>
              </View>
              <Badge label={labels.vehicleStatus[vehicle.status] ?? vehicle.status} tone={statusToneMap[vehicle.status]} />
            </View>

            <View style={styles.vehicleInfoGrid}>
              <InfoCell label="Marca" value={vehicle.marca || '-'} />
              <InfoCell label="Ano" value={vehicle.ano || '-'} />
              <InfoCell label="KM atual" value={formatKm(vehicle.km_atual)} />
              <InfoCell label="Status" value={labels.vehicleStatus[vehicle.status] ?? vehicle.status} />
            </View>

            <View style={styles.actionsRow}>
              <PrimaryButton
                title={vehicle.status === VEHICLE_STATUS.INATIVO ? 'REATIVAR' : 'INATIVAR'}
                variant={vehicle.status === VEHICLE_STATUS.INATIVO ? 'outline' : 'primary'}
                onPress={() => onToggleVehicleStatus(vehicle)}
                style={styles.flexButton}
              />
              <PrimaryButton
                title="TAG NFC"
                variant="primary"
                onPress={() => navigation.navigate('TagsVeiculo', { vehicle })}
                style={styles.flexButton}
              />
            </View>
          </Card>
        ))
      )}

      <FloatingCardModal visible={modalVisible} onRequestClose={closeModal}>
        <Card style={[styles.formCard, { maxHeight: formModalMaxHeight }]}>
          <Text style={styles.formTitle}>{form.id ? 'Editar veículo' : 'Novo veículo'}</Text>
          <Text style={styles.formSubtitle}>Inclua foto oficial para identificação rápida no pátio.</Text>

          <ScrollView
            style={[styles.formScroll, { maxHeight: formScrollMaxHeight }]}
            contentContainerStyle={styles.formScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <TextField
              label="Marca"
              value={form.marca}
              onChangeText={(value) => setForm((old) => ({ ...old, marca: value }))}
              maxLength={32}
            />
            <TextField
              label="Modelo"
              value={form.modelo}
              onChangeText={(value) => setForm((old) => ({ ...old, modelo: value }))}
              maxLength={48}
            />

            <View style={styles.formFieldRow}>
              <View style={styles.formFieldSmall}>
                <TextField
                  label="Ano"
                  value={form.ano}
                  keyboardType="numeric"
                  onChangeText={(value) => setForm((old) => ({ ...old, ano: sanitizeNumericInput(value, 4) }))}
                  maxLength={4}
                />
              </View>
              <View style={styles.formFieldLarge}>
                <TextField
                  label="Cor"
                  value={form.cor}
                  onChangeText={(value) => setForm((old) => ({ ...old, cor: value }))}
                  maxLength={24}
                />
              </View>
            </View>

            <View style={styles.formFieldRow}>
              <View style={styles.formFieldLarge}>
                <TextField
                  label="Placa"
                  value={form.placa}
                  onChangeText={(value) => setForm((old) => ({ ...old, placa: sanitizeVehiclePlateInput(value) }))}
                  maxLength={7}
                />
              </View>
              <View style={styles.formFieldLarge}>
                <TextField
                  label="Quilometragem atual"
                  value={String(form.km_atual)}
                  keyboardType="numeric"
                  onChangeText={(value) => setForm((old) => ({ ...old, km_atual: sanitizeNumericInput(value, 6) }))}
                  maxLength={6}
                />
              </View>
            </View>

            <Text style={styles.sectionTitle}>Foto do veículo</Text>
            <Pressable
              accessibilityRole="button"
              onPress={onPhotoPress}
              disabled={isPickingPhoto || isUploadingPhoto}
              style={({ pressed }) => [
                styles.photoTouchable,
                pressed ? styles.photoTouchablePressed : null,
              ]}
            >
              <VehicleImage sourceUrl={form.foto_url} compact />
              {form.foto_url && showPhotoRemoveAction ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={(event) => { event.stopPropagation?.(); clearPhoto(); }}
                  style={({ pressed }) => [
                    styles.photoRemoveBadge,
                    pressed ? styles.photoRemoveBadgePressed : null,
                  ]}
                >
                  <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
                </Pressable>
              ) : null}
            </Pressable>

            {form.id ? (
              <>
                <Text style={styles.sectionTitle}>Status do veículo</Text>
                <View style={styles.statusRow}>
                  {EDITABLE_VEHICLE_STATUS.map((status) => (
                    <PrimaryButton
                      key={status}
                      title={labels.vehicleStatus[status]}
                      variant={form.status === status ? 'primary' : 'ghost'}
                      onPress={() => setForm((old) => ({ ...old, status }))}
                      style={styles.statusButton}
                    />
                  ))}
                </View>
              </>
            ) : null}
          </ScrollView>

          <View style={styles.formActionsRow}>
            <PrimaryButton title="Cancelar" variant="outline" onPress={closeModal} style={styles.flexButton} />
            <PrimaryButton
              title="Salvar"
              onPress={onSave}
              loading={isSaving}
              disabled={isPickingPhoto || isUploadingPhoto}
              style={styles.flexButton}
            />
          </View>
        </Card>
      </FloatingCardModal>
    </ScreenContainer>
  );
}

function VehicleImage({ sourceUrl, compact = false }) {
  return (
    <View style={[styles.imageWrap, compact ? styles.imageWrapCompact : null]}>
      {sourceUrl ? (
        <Image source={{ uri: sourceUrl }} style={styles.vehicleImage} resizeMode="contain" />
      ) : (
        <View style={styles.placeholderWrap}>
          <Ionicons name="car-sport-outline" size={compact ? 28 : 34} color={colors.textMuted} />
          <Text style={styles.placeholderText}>Sem foto</Text>
        </View>
      )}
    </View>
  );
}

function InfoCell({ label, value }) {
  return (
    <View style={styles.infoCell}>
      <Text style={styles.infoCellLabel}>{label}</Text>
      <Text style={styles.infoCellValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flexButton: {
    flex: 1,
  },
  vehicleCard: {
    gap: spacing.sm,
    borderColor: '#DEE6F1',
    ...shadows.medium,
  },
  vehicleCardInactive: {
    opacity: 0.72,
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
  imageWrap: {
    height: 176,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F6FAFF',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrapCompact: {
    height: 148,
  },
  vehicleImageArea: {
    position: 'relative',
  },
  editImageButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(203, 213, 225, 0.9)',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 4,
  },
  editImageButtonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.97 }],
  },
  photoTouchable: {
    position: 'relative',
    borderRadius: radius.lg,
  },
  photoTouchablePressed: {
    opacity: 0.9,
  },
  photoRemoveBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#B91C1C',
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  photoRemoveBadgePressed: {
    opacity: 0.85,
  },
  vehicleImage: {
    width: '100%',
    height: '100%',
  },
  placeholderWrap: {
    alignItems: 'center',
    gap: spacing.xxs,
  },
  placeholderText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  vehicleHeader: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  vehiclePlate: {
    color: colors.primaryDark,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  vehicleModel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 1,
  },
  vehicleInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  infoCell: {
    width: '48%',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FAFCFF',
    padding: spacing.xs,
    gap: 2,
  },
  infoCellLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  infoCellValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  formActionsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  formCard: {
    gap: spacing.xs,
  },
  formScroll: {},
  formScrollContent: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
  },
  formFieldRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  formFieldLarge: {
    flex: 1,
  },
  formFieldSmall: {
    flex: 0.72,
  },
  formTitle: {
    color: colors.primaryDark,
    fontSize: 22,
    fontWeight: '900',
  },
  formSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  statusButton: {
    minHeight: 36,
  },
});


