import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { NfcPromptModal } from '../../components/ui/NfcPromptModal';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../context/useAuth';
import { cancelNfcOperation, isNfcCancelError, writeVehicleTag } from '../../services/Nfc';
import {
  listVehicleNfcTags,
  setVehicleNfcTagStatus,
  upsertVehicleNfcTag,
} from '../../services/Veiculos';
import { colors, radius, spacing } from '../../theme/tokens';
import { formatDateTime } from '../../utils/formatters';

export function TagsVeiculo({ route, navigation }) {
  const vehicle = route?.params?.vehicle;
  const { profile } = useAuth();
  const [tags, setTags] = useState([]);
  const [tagLabel, setTagLabel] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const loadTags = useCallback(async () => {
    if (!profile?.empresa_id || !vehicle?.id) {
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await listVehicleNfcTags({
        empresaId: profile.empresa_id,
        vehicleId: vehicle.id,
      });
      if (error) {
        throw error;
      }
      setTags(data ?? []);
    } catch (error) {
      Alert.alert('Erro ao carregar TAGs', error.message);
    } finally {
      setIsLoading(false);
    }
  }, [profile?.empresa_id, vehicle?.id]);

  useFocusEffect(
    useCallback(() => {
      loadTags();
    }, [loadTags]),
  );

  useFocusEffect(
    useCallback(
      () => () => {
        cancelNfcOperation();
      },
      [],
    ),
  );

  const onRegisterTag = async () => {
    if (!profile?.empresa_id || !vehicle?.id) {
      Alert.alert('Veículo inválido', 'Não foi possível identificar o veículo para cadastro da TAG.');
      return;
    }

    setIsRegistering(true);
    try {
      const { tagUid, payload } = await writeVehicleTag({ vehicle });

      const { error } = await upsertVehicleNfcTag({
        empresaId: profile.empresa_id,
        vehicleId: vehicle.id,
        tagUid,
        tagLabel,
        tagPayload: payload,
        createdBy: profile.id,
      });

      if (error) {
        throw error;
      }

      setTagLabel('');
      Alert.alert('TAG vinculada', `TAG ${tagUid} registrada com sucesso no veículo ${vehicle.placa}.`);
      loadTags();
    } catch (error) {
      if (isNfcCancelError(error)) {
        return;
      }
      Alert.alert('Falha no cadastro da TAG', error.message);
    } finally {
      setIsRegistering(false);
    }
  };

  const onCancelTagRegister = useCallback(async () => {
    await cancelNfcOperation();
    setIsRegistering(false);
  }, []);

  const onToggleTagStatus = async (tag) => {
    const nextStatus = !tag.ativo;
    const actionLabel = nextStatus ? 'ativar' : 'inativar';

    Alert.alert(
      nextStatus ? 'Ativar TAG' : 'Inativar TAG',
      `Deseja ${actionLabel} a TAG ${tag.tag_uid}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: nextStatus ? 'Ativar' : 'Inativar',
          style: nextStatus ? 'default' : 'destructive',
          onPress: async () => {
            const { error } = await setVehicleNfcTagStatus({
              tagId: tag.id,
              ativo: nextStatus,
            });

            if (error) {
              Alert.alert('Erro', error.message);
              return;
            }
            loadTags();
          },
        },
      ],
      { cancelable: true },
    );
  };

  if (!vehicle) {
    return (
      <ScreenContainer scroll={false} safeEdges={['left', 'right', 'bottom']} contentStyle={[styles.content, styles.centered]}>
        <Card style={styles.card}>
          <Text style={styles.title}>Veículo não encontrado</Text>
          <Text style={styles.subtitle}>Volte para a lista e selecione novamente o veículo.</Text>
          <PrimaryButton title="Voltar" onPress={() => navigation.goBack()} />
        </Card>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      onRefresh={loadTags}
      refreshing={isLoading}
      safeEdges={['left', 'right', 'bottom']}
      contentStyle={styles.content}
    >
      <NfcPromptModal
        visible={isRegistering}
        title="Gravando TAG NFC"
        subtitle="Aproxime a TAG para cadastrar este veículo."
        cancelLabel="Cancelar gravação"
        onCancel={onCancelTagRegister}
      />

      <Card style={styles.card}>
        <TextField
          label="Apelido da TAG (opcional)"
          placeholder="Ex: Chave reserva"
          value={tagLabel}
          onChangeText={setTagLabel}
        />
        <PrimaryButton
          title={isRegistering ? 'Aproxime a TAG...' : 'Vincular TAG'}
          onPress={onRegisterTag}
          loading={isRegistering}
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>TAGs vinculadas</Text>
        {tags.length === 0 ? (
          <EmptyState title="Nenhuma TAG cadastrada" subtitle="Aproxime uma TAG NTAG215 para vincular ao veículo." />
        ) : (
          tags.map((tag) => (
            <View key={tag.id} style={styles.tagItem}>
              <View style={styles.tagTopRow}>
                <View style={styles.uidRow}>
                  <Ionicons name="radio-outline" size={16} color={colors.primaryDark} />
                  <Text style={styles.uidText}>{tag.tag_uid}</Text>
                </View>
                <StatusChip active={tag.ativo} />
              </View>

              {tag.tag_label ? <Text style={styles.tagLabel}>{tag.tag_label}</Text> : null}
              <Text style={styles.tagMeta}>Vinculada em {formatDateTime(tag.created_at)}</Text>

              <Pressable
                accessibilityRole="button"
                onPress={() => onToggleTagStatus(tag)}
                style={({ pressed }) => [styles.actionMiniButton, pressed ? styles.actionMiniButtonPressed : null]}
              >
                <Ionicons
                  name={tag.ativo ? 'pause-circle-outline' : 'play-circle-outline'}
                  size={14}
                  color={tag.ativo ? '#B42318' : '#026C49'}
                />
                <Text style={[styles.actionMiniButtonText, { color: tag.ativo ? '#B42318' : '#026C49' }]}>
                  {tag.ativo ? 'Inativar' : 'Ativar'}
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </Card>
    </ScreenContainer>
  );
}

function StatusChip({ active }) {
  return (
    <View style={[styles.statusChip, active ? styles.statusChipActive : styles.statusChipInactive]}>
      <Text style={[styles.statusChipText, active ? styles.statusChipTextActive : styles.statusChipTextInactive]}>
        {active ? 'ATIVA' : 'INATIVA'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.xs,
  },
  centered: {
    justifyContent: 'center',
  },
  card: {
    gap: spacing.sm,
  },
  title: {
    color: colors.primaryDark,
    fontSize: 22,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  sectionTitle: {
    color: colors.primaryDark,
    fontSize: 16,
    fontWeight: '800',
  },
  tagItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: '#FAFCFF',
    padding: spacing.sm,
    gap: spacing.xs,
  },
  tagTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  uidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  uidText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  tagLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  tagMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  statusChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  statusChipActive: {
    borderColor: '#86EFAC',
    backgroundColor: '#DCFCE7',
  },
  statusChipInactive: {
    borderColor: '#FECACA',
    backgroundColor: '#FEE2E2',
  },
  statusChipText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  statusChipTextActive: {
    color: '#166534',
  },
  statusChipTextInactive: {
    color: '#B91C1C',
  },
  actionMiniButton: {
    minHeight: 30,
    borderWidth: 1,
    borderColor: '#D8DFEA',
    borderRadius: radius.pill,
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionMiniButtonPressed: {
    opacity: 0.85,
  },
  actionMiniButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
});

