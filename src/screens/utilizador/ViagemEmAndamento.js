import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '../../components/ui/Card';
import { NfcPromptModal } from '../../components/ui/NfcPromptModal';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../context/useAuth';
import { isNfcCancelError, normalizeTagUid, scanNfcTag } from '../../services/Nfc';
import { obterViagemAbertaPorUtilizador } from '../../services/Viagens';
import { findVehicleById, findVehicleByNfcTag } from '../../services/Veiculos';
import { colors, radius, shadows, spacing } from '../../theme/tokens';
import { labels, VEHICLE_STATUS } from '../../utils/constants';
import { formatKm } from '../../utils/formatters';

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

function formatStartHour(value) {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function extractVehicleIdFromPayload(payload) {
  const text = String(payload ?? '').trim();
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed?.vehicle_id) {
      return String(parsed.vehicle_id);
    }
  } catch (error) {
    // Mantém fallback textual simples abaixo.
  }

  if (text.startsWith('easyfrotas:')) {
    return text.replace('easyfrotas:', '').trim() || null;
  }

  return null;
}

export function ViagemEmAndamento({ navigation }) {
  const START_METHOD = {
    NFC: 'nfc',
    MANUAL: 'manual',
  };
  const { profile } = useAuth();
  const [openTrip, setOpenTrip] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isScanningNfc, setIsScanningNfc] = useState(false);
  const [startMethod, setStartMethod] = useState(START_METHOD.NFC);
  const [manualTagCode, setManualTagCode] = useState('');
  const [isSearchingManualCode, setIsSearchingManualCode] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  const loadOpenTrip = useCallback(async () => {
    if (!profile) {
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await obterViagemAbertaPorUtilizador({
        idUtilizador: profile.id,
        empresaId: profile.empresa_id,
      });
      if (error) {
        throw error;
      }
      setOpenTrip(data ?? null);
    } catch (error) {
      Alert.alert('Erro ao carregar viagem', error.message);
    } finally {
      setIsLoading(false);
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      loadOpenTrip();
    }, [loadOpenTrip]),
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

  const resolveVehicleFromTag = useCallback(
    async ({ tagUid, ndefTextPayload = null }) => {
      let { data: vehicle, error } = await findVehicleByNfcTag({
        empresaId: profile.empresa_id,
        tagUid,
      });

      if ((!vehicle || error) && ndefTextPayload) {
        const payloadVehicleId = extractVehicleIdFromPayload(ndefTextPayload);
        if (payloadVehicleId) {
          const fallbackResult = await findVehicleById({
            empresaId: profile.empresa_id,
            vehicleId: payloadVehicleId,
          });
          vehicle = fallbackResult.data ?? vehicle;
          error = fallbackResult.error ?? error;
        }
      }

      if (error) {
        throw error;
      }
      if (!vehicle) {
        throw new Error('TAG não vinculada. Solicite ao gestor o cadastro desta TAG no veículo.');
      }
      if (vehicle.status !== VEHICLE_STATUS.DISPONIVEL) {
        throw new Error(`Veículo indisponível. Status atual: ${labels.vehicleStatus[vehicle.status] ?? vehicle.status}.`);
      }

      return vehicle;
    },
    [profile.empresa_id],
  );

  const goToStartTripByTag = useCallback(
    async ({ tagUid, ndefTextPayload = null }) => {
      const vehicle = await resolveVehicleFromTag({ tagUid, ndefTextPayload });
      navigation.navigate('IniciarViagem', { vehicle });
    },
    [navigation, resolveVehicleFromTag],
  );

  const onScanNfc = async () => {
    if (!profile || isScanningNfc || isSearchingManualCode) {
      return;
    }

    setIsScanningNfc(true);
    try {
      const scanResult = await scanNfcTag();
      await goToStartTripByTag({
        tagUid: scanResult.tagUid,
        ndefTextPayload: scanResult.ndefTextPayload,
      });
    } catch (error) {
      if (isNfcCancelError(error)) {
        return;
      }
      Alert.alert('Falha na leitura NFC', error.message);
    } finally {
      setIsScanningNfc(false);
    }
  };

  const onManualSearch = async () => {
    if (!profile || isScanningNfc || isSearchingManualCode) {
      return;
    }

    const normalizedTagCode = normalizeTagUid(manualTagCode);
    if (!normalizedTagCode) {
      Alert.alert('Código inválido', 'Digite o código da TAG para buscar o veículo.');
      return;
    }

    setIsSearchingManualCode(true);
    try {
      await goToStartTripByTag({ tagUid: normalizedTagCode });
    } catch (error) {
      Alert.alert('Falha na busca manual', error.message);
    } finally {
      setIsSearchingManualCode(false);
    }
  };

  const elapsedLabel = useMemo(
    () => formatElapsedTime(openTrip?.started_at, nowMs),
    [openTrip?.started_at, nowMs],
  );

  if (!openTrip) {
    return (
      <ScreenContainer contentStyle={styles.container} safeEdges={['top', 'left', 'right', 'bottom']}>
        <NfcPromptModal
          visible={isScanningNfc}
          title="Escaneando TAG NFC"
          subtitle="Aproxime a TAG do veículo para iniciar a viagem."
        />

        <Card style={styles.tripStatusCard}>
          <View style={styles.tripStatusTextWrap}>
            <Text style={styles.tripStatusTitle}>
              {isLoading ? 'Verificando viagem em andamento...' : 'Nenhuma viagem em andamento'}
            </Text>
            <Text style={styles.tripStatusSubtitle}>
              {isLoading
                ? 'Aguarde alguns instantes enquanto atualizamos o seu status.'
                : 'Use uma das opções abaixo para iniciar uma nova viagem.'}
            </Text>
          </View>
        </Card>

        <Card style={styles.startTripCard}>
          <View style={styles.startTripHeader}>
            <View style={styles.startTripIconWrap}>
              <Ionicons name="car-sport-outline" size={28} color={colors.primaryDark} />
            </View>
            <View style={styles.startTripHeaderText}>
              <Text style={styles.startTripTitle}>Iniciar nova viagem</Text>
              <Text style={styles.startTripSubtitle}>
                Escolha como deseja identificar o veículo.
              </Text>
            </View>
          </View>

          <View style={styles.methodSelectorRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setStartMethod(START_METHOD.NFC)}
              disabled={isScanningNfc || isSearchingManualCode}
              style={({ pressed }) => [
                styles.methodOptionButton,
                startMethod === START_METHOD.NFC ? styles.methodOptionButtonActive : null,
                pressed ? styles.methodOptionPressed : null,
              ]}
            >
              <Ionicons
                name="radio-outline"
                size={16}
                color={startMethod === START_METHOD.NFC ? '#FFFFFF' : colors.primaryDark}
              />
              <Text
                style={[
                  styles.methodOptionText,
                  startMethod === START_METHOD.NFC ? styles.methodOptionTextActive : null,
                ]}
              >
                TAG NFC
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => setStartMethod(START_METHOD.MANUAL)}
              disabled={isScanningNfc || isSearchingManualCode}
              style={({ pressed }) => [
                styles.methodOptionButton,
                startMethod === START_METHOD.MANUAL ? styles.methodOptionButtonActive : null,
                pressed ? styles.methodOptionPressed : null,
              ]}
            >
              <Ionicons
                name="keypad-outline"
                size={16}
                color={startMethod === START_METHOD.MANUAL ? '#FFFFFF' : colors.primaryDark}
              />
              <Text
                style={[
                  styles.methodOptionText,
                  startMethod === START_METHOD.MANUAL ? styles.methodOptionTextActive : null,
                ]}
              >
                Código manual
              </Text>
            </Pressable>
          </View>

          {startMethod === START_METHOD.NFC ? (
            <View style={styles.methodBlock}>
              <PrimaryButton
                title={isScanningNfc ? 'Escaneando TAG NFC...' : 'Escanear TAG NFC'}
                onPress={onScanNfc}
                loading={isScanningNfc}
                disabled={isLoading || isSearchingManualCode}
                style={styles.fullWidthButton}
              />
              <Text style={styles.methodHelperText}>
                Aproxime a TAG do celular para encontrar o veículo automaticamente.
              </Text>
            </View>
          ) : (
            <View style={styles.methodBlock}>
              <TextField
                label="Código da TAG"
                value={manualTagCode}
                onChangeText={(value) => setManualTagCode(value.toUpperCase())}
                placeholder="Ex: 04A1B2C3D4E5"
                autoCapitalize="characters"
              />
              <PrimaryButton
                title={isSearchingManualCode ? 'Buscando código...' : 'Buscar por código manual'}
                onPress={onManualSearch}
                loading={isSearchingManualCode}
                disabled={isLoading || isScanningNfc}
                style={styles.fullWidthButton}
              />
            </View>
          )}

        </Card>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      scroll={false}
      contentStyle={styles.container}
      safeEdges={['top', 'left', 'right', 'bottom']}
    >
      <View style={styles.topBlock}>
        <View style={styles.iconBox}>
          <Ionicons name="car-sport" size={34} color="#047857" />
        </View>
        <Text style={styles.title}>Viagem em andamento</Text>
        <Text style={styles.subtitle}>Conduza com segurança.</Text>
      </View>

      <Card style={styles.timerCard}>
        <Text style={styles.timerLabel}>Tempo decorrido</Text>
        <Text style={styles.timerValue}>{elapsedLabel}</Text>
      </Card>

      <Card style={styles.vehicleCard}>
        <View style={styles.vehicleTop}>
          <View style={styles.vehicleIcon}>
            <Ionicons name="car-outline" size={18} color={colors.textMuted} />
          </View>
          <View style={styles.vehicleInfo}>
            <Text style={styles.vehicleModel} numberOfLines={1}>
              {openTrip.vehicles?.modelo || 'Veículo em uso'}
            </Text>
            <Text style={styles.vehiclePlate}>{openTrip.vehicles?.placa || '-'}</Text>
          </View>
          <View style={styles.fleetTag}>
            <Text style={styles.fleetTagText}>Viagem ativa</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricTitle}>Início</Text>
            <View style={styles.metricValueRow}>
              <Ionicons name="time-outline" size={14} color={colors.textMuted} />
              <Text style={styles.metricValue}>{formatStartHour(openTrip.started_at)}</Text>
            </View>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricTitle}>KM inicial</Text>
            <View style={styles.metricValueRow}>
              <Ionicons name="speedometer-outline" size={14} color={colors.textMuted} />
              <Text style={styles.metricValue}>{formatKm(openTrip.km_inicial)}</Text>
            </View>
          </View>
        </View>
      </Card>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('FinalizarViagem', { tripId: openTrip.id })}
          disabled={isLoading}
          style={({ pressed }) => [
            styles.finishButton,
            {
              opacity: isLoading ? 0.65 : pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.99 : 1 }],
            },
          ]}
        >
          {isLoading ? (
            <ActivityIndicator color="#E7FFF6" size="small" />
          ) : (
            <View style={styles.finishButtonInner}>
              <Ionicons name="stop-circle" size={18} color="#E7FFF6" />
              <Text style={styles.finishButtonText}>Finalizar viagem</Text>
            </View>
          )}
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: spacing.xs,
    gap: spacing.md,
  },
  tripStatusCard: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderColor: '#D7DEE8',
    backgroundColor: '#F8FBFF',
  },
  tripStatusTextWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tripStatusTitle: {
    color: colors.primaryDark,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  tripStatusSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  startTripCard: {
    gap: spacing.sm,
    borderColor: '#D7DEE8',
  },
  startTripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  startTripIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D4DEEE',
    backgroundColor: '#EAF1FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startTripHeaderText: {
    flex: 1,
    gap: 2,
  },
  startTripTitle: {
    color: colors.primaryDark,
    fontSize: 21,
    fontWeight: '900',
  },
  startTripSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  methodSelectorRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  methodOptionButton: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#D6DEEA',
    borderRadius: radius.md,
    backgroundColor: '#F4F7FC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  methodOptionButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  methodOptionPressed: {
    opacity: 0.88,
  },
  methodOptionText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },
  methodOptionTextActive: {
    color: '#FFFFFF',
  },
  methodBlock: {
    gap: spacing.xs,
  },
  fullWidthButton: {
    width: '100%',
  },
  methodHelperText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  topBlock: {
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  iconBox: {
    width: 88,
    height: 88,
    borderRadius: 20,
    backgroundColor: '#DCE9FA',
    borderWidth: 1,
    borderColor: '#D0DCEE',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  title: {
    color: '#3D4450',
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: '#646D7B',
    fontSize: 16,
    fontWeight: '600',
  },
  timerCard: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
  },
  timerLabel: {
    color: '#666E7A',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  timerValue: {
    color: colors.primaryDark,
    fontSize: 32,
    fontWeight: '500',
    letterSpacing: 1.2,
  },
  vehicleCard: {
    gap: spacing.sm,
    padding: spacing.sm,
  },
  vehicleTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  vehicleIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: '#DCE9FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleModel: {
    color: '#4B5563',
    fontSize: 15,
    fontWeight: '800',
  },
  vehiclePlate: {
    color: '#4B5563',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 1,
  },
  fleetTag: {
    borderRadius: radius.pill,
    backgroundColor: '#E3ECFA',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  fleetTagText: {
    color: '#5A6578',
    fontSize: 12,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#DEE5EF',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  metricItem: {
    flex: 1,
    gap: spacing.xs,
  },
  metricTitle: {
    color: '#676F7B',
    fontSize: 13,
    fontWeight: '700',
  },
  metricValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricValue: {
    color: '#3F4755',
    fontSize: 16,
    fontWeight: '800',
  },
  footer: {
    marginTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  finishButton: {
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#047857',
    backgroundColor: '#047857',
    justifyContent: 'center',
    alignItems: 'center',
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

