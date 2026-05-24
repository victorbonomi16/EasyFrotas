import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

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

export function Veiculos() {
  const navigation = useNavigation();
  const { profile } = useAuth();
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
    if (!form.placa.trim() || !form.modelo.trim()) {
      Alert.alert('Campos obrigatórios', 'Informe ao menos placa e modelo.');
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
        placa: form.placa.trim().toUpperCase(),
        modelo: form.modelo.trim(),
        marca: form.marca.trim() || null,
        cor: form.cor.trim() || null,
        foto_url: form.foto_url?.trim() || null,
        km_atual: sanitizeNumber(form.km_atual),
        ano: form.ano ? Number(form.ano) : null,
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
        vehicles.map((vehicle) => (
          <Card key={vehicle.id} style={styles.vehicleCard}>
            <VehicleImage sourceUrl={vehicle.foto_url} />

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
              <PrimaryButton title="Editar" variant="ghost" onPress={() => openEditModal(vehicle)} style={styles.flexButton} />
              <PrimaryButton
                title="TAG NFC"
                variant="outline"
                onPress={() => navigation.navigate('TagsVeiculo', { vehicle })}
                style={styles.flexButton}
              />
            </View>
            <PrimaryButton
              title={vehicle.status === VEHICLE_STATUS.INATIVO ? 'Reativar veículo' : 'Inativar veículo'}
              variant={vehicle.status === VEHICLE_STATUS.INATIVO ? 'primary' : 'outline'}
              onPress={() => onToggleVehicleStatus(vehicle)}
            />
          </Card>
        ))
      )}

      <FloatingCardModal visible={modalVisible} onRequestClose={closeModal}>
        <Card style={styles.formCard}>
          <Text style={styles.formTitle}>{form.id ? 'Editar veículo' : 'Novo veículo'}</Text>
          <Text style={styles.formSubtitle}>Inclua foto oficial para identificação rápida no pátio.</Text>

          <TextField label="Placa" value={form.placa} onChangeText={(value) => setForm((old) => ({ ...old, placa: value }))} />
          <TextField label="Modelo" value={form.modelo} onChangeText={(value) => setForm((old) => ({ ...old, modelo: value }))} />
          <TextField label="Marca" value={form.marca} onChangeText={(value) => setForm((old) => ({ ...old, marca: value }))} />
          <TextField label="Ano" value={form.ano} keyboardType="numeric" onChangeText={(value) => setForm((old) => ({ ...old, ano: value }))} />
          <TextField label="Cor" value={form.cor} onChangeText={(value) => setForm((old) => ({ ...old, cor: value }))} />
          <TextField
            label="Quilometragem atual"
            value={String(form.km_atual)}
            keyboardType="numeric"
            onChangeText={(value) => setForm((old) => ({ ...old, km_atual: value }))}
          />

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
                {Object.values(VEHICLE_STATUS).map((status) => (
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
    marginTop: spacing.md,
  },
  formCard: {
    gap: spacing.xs,
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


