import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card } from '../../components/ui/Card';
import { FloatingCardModal } from '../../components/ui/FloatingCardModal';
import { LeitorQuilometragemModal } from '../../components/ui/LeitorQuilometragemModal';
import { NfcPromptModal } from '../../components/ui/NfcPromptModal';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../context/useAuth';
import { leituraCameraDisponivel } from '../../services/LeituraQuilometragem';
import { cancelNfcOperation, isNfcCancelError, scanNfcTag } from '../../services/Nfc';
import { finishTrip, obterViagemAbertaPorUtilizador } from '../../services/Viagens';
import { findVehicleById, findVehicleByNfcTag, findVehicleByPlate, normalizeVehiclePlate } from '../../services/Veiculos';
import { colors, radius, shadows, spacing } from '../../theme/tokens';
import { labels, OCCURRENCE_TYPES, VEHICLE_STATUS } from '../../utils/constants';
import { formatKm, sanitizeNumber } from '../../utils/formatters';

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

const FINISH_STEP = {
  CONFIRM: 'confirm',
  KM: 'km',
  OCCURRENCE: 'occurrence',
};

const occurrenceOptions = [
  { value: OCCURRENCE_TYPES.ABASTECIMENTO, label: 'Abastecimento', icon: 'water-outline' },
  { value: OCCURRENCE_TYPES.MANUTENCAO, label: 'Manutenção', icon: 'build-outline' },
  { value: OCCURRENCE_TYPES.OUTROS, label: 'Outros', icon: 'remove-outline' },
];

export function ViagemEmAndamento({ navigation }) {
  const START_METHOD = {
    NFC: 'nfc',
    MANUAL: 'manual',
  };
  const cameraReaderEnabled = leituraCameraDisponivel();
  const { profile } = useAuth();
  const [openTrip, setOpenTrip] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isScanningNfc, setIsScanningNfc] = useState(false);
  const [startMethod, setStartMethod] = useState(START_METHOD.NFC);
  const [manualVehiclePlate, setManualVehiclePlate] = useState('');
  const [isSearchingManualPlate, setIsSearchingManualPlate] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [finishStep, setFinishStep] = useState(null);
  const [kmFinal, setKmFinal] = useState('');
  const [occurrenceType, setOccurrenceType] = useState(null);
  const [occurrenceDescription, setOccurrenceDescription] = useState('');
  const [isFinishingTrip, setIsFinishingTrip] = useState(false);
  const [isLeitorKmFinalVisible, setIsLeitorKmFinalVisible] = useState(false);
  const finishStepAnim = useRef(new Animated.Value(0)).current;

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

  useEffect(
    () => () => {
      cancelNfcOperation();
    },
    [],
  );

  useEffect(() => {
    if (!finishStep) {
      finishStepAnim.setValue(0);
      return;
    }

    finishStepAnim.setValue(0);
    Animated.spring(finishStepAnim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 17,
      stiffness: 180,
      mass: 0.8,
    }).start();
  }, [finishStep, finishStepAnim]);

  const ensureVehicleAvailable = useCallback((vehicle) => {
    if (!vehicle) {
      throw new Error('Veículo não encontrado.');
    }
    if (vehicle.status !== VEHICLE_STATUS.DISPONIVEL) {
      throw new Error(`Veículo indisponível. Status atual: ${labels.vehicleStatus[vehicle.status] ?? vehicle.status}.`);
    }
    return vehicle;
  }, []);

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
      return ensureVehicleAvailable(vehicle);
    },
    [ensureVehicleAvailable, profile.empresa_id],
  );

  const goToStartTripByTag = useCallback(
    async ({ tagUid, ndefTextPayload = null }) => {
      const vehicle = await resolveVehicleFromTag({ tagUid, ndefTextPayload });
      navigation.navigate('IniciarViagem', { vehicle });
    },
    [navigation, resolveVehicleFromTag],
  );

  const onScanNfc = async () => {
    if (!profile || isScanningNfc || isSearchingManualPlate) {
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

  const onCancelNfcScan = useCallback(async () => {
    await cancelNfcOperation();
    setIsScanningNfc(false);
  }, []);

  const onManualSearch = async () => {
    if (!profile || isScanningNfc || isSearchingManualPlate) {
      return;
    }

    const normalizedPlate = normalizeVehiclePlate(manualVehiclePlate);
    if (!normalizedPlate) {
      Alert.alert('Placa inválida', 'Digite a placa do veículo para iniciar a viagem.');
      return;
    }

    setIsSearchingManualPlate(true);
    try {
      const { data: vehicle, error } = await findVehicleByPlate({
        empresaId: profile.empresa_id,
        plate: normalizedPlate,
      });

      if (error) {
        throw error;
      }
      if (!vehicle) {
        throw new Error('Veículo não encontrado para a placa informada.');
      }

      const availableVehicle = ensureVehicleAvailable(vehicle);
      navigation.navigate('IniciarViagem', { vehicle: availableVehicle });
    } catch (error) {
      Alert.alert('Falha na busca por placa', error.message);
    } finally {
      setIsSearchingManualPlate(false);
    }
  };

  const openFinishFlow = useCallback(() => {
    if (!openTrip || isLoading) {
      return;
    }
    setIsLeitorKmFinalVisible(false);
    setKmFinal(String(openTrip.km_inicial ?? ''));
    setOccurrenceType(null);
    setOccurrenceDescription('');
    setFinishStep(FINISH_STEP.CONFIRM);
  }, [isLoading, openTrip]);

  const closeFinishFlow = useCallback(() => {
    if (isFinishingTrip) {
      return;
    }
    setIsLeitorKmFinalVisible(false);
    setFinishStep(null);
  }, [isFinishingTrip]);

  const onConfirmKm = useCallback(() => {
    if (!openTrip) {
      return;
    }
    const parsedKm = sanitizeNumber(kmFinal);
    if (parsedKm < Number(openTrip.km_inicial)) {
      Alert.alert('Quilometragem inválida', 'A quilometragem final deve ser maior ou igual à inicial.');
      return;
    }
    setFinishStep(FINISH_STEP.OCCURRENCE);
  }, [kmFinal, openTrip]);

  const onSubmitFinish = useCallback(async () => {
    if (!openTrip) {
      return;
    }

    const parsedKm = sanitizeNumber(kmFinal);
    if (parsedKm < Number(openTrip.km_inicial)) {
      Alert.alert('Quilometragem inválida', 'A quilometragem final deve ser maior ou igual à inicial.');
      return;
    }

    setIsFinishingTrip(true);
    try {
      const { error } = await finishTrip({
        tripId: openTrip.id,
        kmFinal: parsedKm,
        observacaoFim: null,
        occurrenceType,
        occurrenceDescription: occurrenceDescription.trim(),
      });
      if (error) {
        throw error;
      }

      setIsLeitorKmFinalVisible(false);
      setFinishStep(null);
      await loadOpenTrip();
      navigation.navigate('AbasPrincipais', { screen: 'Historico' });
    } catch (error) {
      Alert.alert('Falha ao encerrar', error.message);
    } finally {
      setIsFinishingTrip(false);
    }
  }, [kmFinal, loadOpenTrip, navigation, occurrenceDescription, occurrenceType, openTrip]);

  const elapsedLabel = useMemo(
    () => formatElapsedTime(openTrip?.started_at, nowMs),
    [openTrip?.started_at, nowMs],
  );

  const finishStepAnimatedStyle = useMemo(
    () => ({
      opacity: finishStepAnim,
      transform: [
        {
          translateY: finishStepAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [18, 0],
          }),
        },
        {
          scale: finishStepAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.98, 1],
          }),
        },
      ],
    }),
    [finishStepAnim],
  );

  if (!openTrip) {
    return (
      <ScreenContainer contentStyle={styles.container} safeEdges={['top', 'left', 'right', 'bottom']}>
        <NfcPromptModal
          visible={isScanningNfc}
          title="Escaneando TAG NFC"
          subtitle="Aproxime a TAG do veículo para iniciar a viagem."
          cancelLabel="Cancelar leitura"
          onCancel={onCancelNfcScan}
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
              disabled={isScanningNfc || isSearchingManualPlate}
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
              disabled={isScanningNfc || isSearchingManualPlate}
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
                PLACA
              </Text>
            </Pressable>
          </View>

          {startMethod === START_METHOD.NFC ? (
            <View style={styles.methodBlock}>
              <PrimaryButton
                title={isScanningNfc ? 'Escaneando TAG NFC...' : 'Escanear TAG NFC'}
                onPress={onScanNfc}
                loading={isScanningNfc}
                disabled={isLoading || isSearchingManualPlate}
                style={styles.fullWidthButton}
              />
              <Text style={styles.methodHelperText}>
                Aproxime a TAG do celular para encontrar o veículo automaticamente.
              </Text>
            </View>
          ) : (
            <View style={styles.methodBlock}>
              <TextField
                label="Placa do veículo"
                value={manualVehiclePlate}
                onChangeText={(value) => setManualVehiclePlate(value.toUpperCase())}
                placeholder="Ex: ABC1D23"
                autoCapitalize="characters"
              />
              <PrimaryButton
                title={isSearchingManualPlate ? 'Buscando placa...' : 'Buscar por placa'}
                onPress={onManualSearch}
                loading={isSearchingManualPlate}
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
      <Card style={styles.tripHeaderCard}>
        <Text style={styles.tripHeaderTitle}>Viagem em andamento</Text>
        <Text style={styles.tripHeaderSubtitle}>Conduza com segurança durante todo o percurso.</Text>
      </Card>

      <Card style={styles.vehicleCard}>
        <View style={styles.imageWrap}>
          {openTrip.vehicles?.foto_url ? (
            <Image source={{ uri: openTrip.vehicles.foto_url }} style={styles.vehicleImage} resizeMode="cover" />
          ) : (
            <View style={styles.imageFallback}>
              <Ionicons name="car-sport-outline" size={58} color={colors.textMuted} />
              <Text style={styles.imageFallbackText}>Sem foto do veículo</Text>
            </View>
          )}
          <View style={styles.statusChip}>
            <Text style={styles.statusChipText}>Em uso</Text>
          </View>
        </View>

        <View style={styles.mainInfoRow}>
          <View style={styles.mainInfoText}>
            <Text style={styles.vehicleModel} numberOfLines={1}>
              {openTrip.vehicles?.modelo || 'Veículo em uso'}
            </Text>
            <Text style={styles.vehicleCategory} numberOfLines={1}>
              {openTrip.vehicles?.marca || 'Veículo corporativo'}
            </Text>
          </View>
          <View style={styles.plateBox}>
            <Text style={styles.vehiclePlate} numberOfLines={1}>
              {openTrip.vehicles?.placa || '-'}
            </Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Ionicons name="time-outline" size={18} color={colors.textMuted} />
            <View style={styles.metricValueRow}>
              <Text style={styles.metricLabel}>Início</Text>
              <Text style={styles.metricValue}>{formatStartHour(openTrip.started_at)}</Text>
            </View>
          </View>
          <View style={styles.metricItem}>
            <Ionicons name="speedometer-outline" size={18} color={colors.textMuted} />
            <View style={styles.metricValueRow}>
              <Text style={styles.metricLabel}>KM inicial</Text>
              <Text style={styles.metricValue}>{formatKm(openTrip.km_inicial)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.elapsedSection}>
          <Text style={styles.elapsedLabel}>Tempo decorrido</Text>
          <Text style={styles.elapsedValue}>{elapsedLabel}</Text>
        </View>
      </Card>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          onPress={openFinishFlow}
          disabled={isLoading || isFinishingTrip}
          style={({ pressed }) => [
            styles.finishButton,
            {
              opacity: isLoading || isFinishingTrip ? 0.65 : pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.99 : 1 }],
            },
          ]}
        >
          {isLoading || isFinishingTrip ? (
            <ActivityIndicator color="#E7FFF6" size="small" />
          ) : (
            <View style={styles.finishButtonInner}>
              <Ionicons name="stop-circle" size={18} color="#E7FFF6" />
              <Text style={styles.finishButtonText}>Finalizar viagem</Text>
            </View>
          )}
        </Pressable>
      </View>

      <FloatingCardModal visible={Boolean(finishStep)} onRequestClose={closeFinishFlow}>
        <Animated.View style={finishStepAnimatedStyle}>
          <Card style={styles.finishFlowCard}>
            {finishStep === FINISH_STEP.CONFIRM ? (
              <View style={styles.finishFlowBodyCenter}>
                <View style={styles.finishFlowIconWrap}>
                  <Ionicons name="checkmark-done-circle-outline" size={34} color={colors.primary} />
                </View>
                <Text style={styles.finishFlowTitle}>Finalizar viagem agora?</Text>
                <Text style={styles.finishFlowSubtitle}>
                  Confirme para iniciar o encerramento da viagem com os dados finais.
                </Text>
              </View>
            ) : null}

            {finishStep === FINISH_STEP.KM ? (
              <View style={styles.finishFlowBody}>
                <Text style={styles.finishFlowTitleLeft}>Confirmação de quilometragem</Text>
                <Text style={styles.finishFlowSubtitleLeft}>
                  Informe o KM final atual para concluir o fechamento da viagem.
                </Text>

                <View style={styles.finishFlowKmGrid}>
                  <View style={styles.finishFlowKmReadonly}>
                    <Text style={styles.finishFlowFieldLabel}>KM inicial</Text>
                    <Text style={styles.finishFlowKmValue}>{formatKm(openTrip.km_inicial)}</Text>
                  </View>
                  <View style={styles.finishFlowKmInputWrap}>
                    <Text style={styles.finishFlowFieldLabel}>KM final *</Text>
                    <TextInput
                      value={kmFinal}
                      onChangeText={setKmFinal}
                      keyboardType="numeric"
                      placeholder="Ex: 45280"
                      placeholderTextColor={colors.textMuted}
                      style={styles.finishFlowKmInput}
                    />
                  </View>
                  {cameraReaderEnabled ? (
                    <PrimaryButton
                      title="Ler KM com câmera"
                      variant="ghost"
                      onPress={() => setIsLeitorKmFinalVisible(true)}
                      style={styles.finishFlowKmCameraButton}
                    />
                  ) : (
                    <Text style={styles.finishFlowCameraUnavailable}>
                      Leitura por câmera disponível na APK.
                    </Text>
                  )}
                </View>
              </View>
            ) : null}

            {finishStep === FINISH_STEP.OCCURRENCE ? (
              <View style={styles.finishFlowBody}>
                <Text style={styles.finishFlowTitleLeft}>Ocorrências da viagem</Text>
                <Text style={styles.finishFlowSubtitleLeft}>
                  Se necessário, registre uma ocorrência. Este passo é opcional.
                </Text>

                <View style={styles.finishFlowOccurrencePills}>
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
                          styles.finishFlowOccurrencePill,
                          selected ? styles.finishFlowOccurrencePillSelected : null,
                          pressed ? styles.finishFlowOccurrencePillPressed : null,
                        ]}
                      >
                        <Ionicons name={item.icon} size={14} color={selected ? '#065F46' : '#4B5563'} />
                        <Text
                          style={[
                            styles.finishFlowOccurrencePillText,
                            selected ? styles.finishFlowOccurrencePillTextSelected : null,
                          ]}
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {occurrenceType ? (
                  <View style={styles.finishFlowOccurrenceInputWrap}>
                    <Text style={styles.finishFlowFieldLabel}>Descrição (opcional)</Text>
                    <TextInput
                      value={occurrenceDescription}
                      onChangeText={setOccurrenceDescription}
                      placeholder="Ex: Detalhes da ocorrência..."
                      placeholderTextColor={colors.textMuted}
                      multiline
                      numberOfLines={4}
                      style={styles.finishFlowOccurrenceInput}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={styles.finishFlowActions}>
              {finishStep === FINISH_STEP.CONFIRM ? (
                <>
                  <PrimaryButton
                    title="Cancelar"
                    variant="outline"
                    onPress={closeFinishFlow}
                    style={styles.finishFlowActionButton}
                  />
                  <PrimaryButton
                    title="Continuar"
                    onPress={() => setFinishStep(FINISH_STEP.KM)}
                    style={styles.finishFlowActionButton}
                  />
                </>
              ) : null}

              {finishStep === FINISH_STEP.KM ? (
                <>
                  <PrimaryButton
                    title="Voltar"
                    variant="outline"
                    onPress={() => setFinishStep(FINISH_STEP.CONFIRM)}
                    style={styles.finishFlowActionButton}
                  />
                  <PrimaryButton
                    title="Confirmar KM"
                    onPress={onConfirmKm}
                    style={styles.finishFlowActionButton}
                  />
                </>
              ) : null}

              {finishStep === FINISH_STEP.OCCURRENCE ? (
                <>
                  <PrimaryButton
                    title="Voltar"
                    variant="outline"
                    onPress={() => setFinishStep(FINISH_STEP.KM)}
                    style={styles.finishFlowActionButton}
                  />
                  <PrimaryButton
                    title={isFinishingTrip ? 'Finalizando...' : 'Encerrar viagem'}
                    onPress={onSubmitFinish}
                    loading={isFinishingTrip}
                    style={styles.finishFlowActionButton}
                  />
                </>
              ) : null}
            </View>
          </Card>
        </Animated.View>
      </FloatingCardModal>

      {cameraReaderEnabled ? (
        <LeitorQuilometragemModal
          visible={isLeitorKmFinalVisible}
          onClose={() => setIsLeitorKmFinalVisible(false)}
          onConfirmKm={(valor) => setKmFinal(String(valor))}
          minKm={Number(openTrip?.km_inicial ?? 0)}
          titulo="Leitura do KM final"
          subtitulo="Posicione o odômetro na moldura para validar o encerramento da viagem."
        />
      ) : null}
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
  tripHeaderCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderColor: '#D7DEE8',
    backgroundColor: '#F8FBFF',
    paddingVertical: spacing.md,
  },
  tripHeaderTitle: {
    color: colors.primaryDark,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  tripHeaderSubtitle: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
  vehicleCard: {
    borderColor: '#D6DEE8',
    padding: 0,
    overflow: 'hidden',
    ...shadows.medium,
  },
  imageWrap: {
    position: 'relative',
    height: 206,
    backgroundColor: '#E9EEF4',
  },
  vehicleImage: {
    width: '100%',
    height: '100%',
  },
  imageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  imageFallbackText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  statusChip: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#DBEAFE',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  statusChipText: {
    color: '#1E3A8A',
    fontSize: 13,
    fontWeight: '800',
  },
  mainInfoRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  mainInfoText: {
    flex: 1,
    gap: 2,
  },
  vehicleModel: {
    color: colors.primaryDark,
    fontSize: 18,
    fontWeight: '900',
  },
  vehicleCategory: {
    color: '#303747',
    fontSize: 16,
    fontWeight: '500',
  },
  plateBox: {
    minHeight: 54,
    minWidth: 142,
    borderRadius: radius.md - 2,
    borderWidth: 1,
    borderColor: '#C8D0DB',
    backgroundColor: '#EFF3F8',
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehiclePlate: {
    color: colors.primaryDark,
    fontSize: 22 / 1.2,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  metricsRow: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#E1E6EE',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  elapsedSection: {
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#E1E6EE',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  elapsedLabel: {
    color: '#666E7A',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  elapsedValue: {
    color: colors.primaryDark,
    fontSize: 30,
    fontWeight: '600',
    letterSpacing: 1,
  },
  finishFlowCard: {
    gap: spacing.md,
    borderColor: '#D7DEE8',
    ...shadows.medium,
  },
  finishFlowBodyCenter: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  finishFlowBody: {
    gap: spacing.sm,
  },
  finishFlowIconWrap: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#E5ECF8',
    borderWidth: 1,
    borderColor: '#D0DCEE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishFlowTitle: {
    color: colors.primaryDark,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  finishFlowSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  finishFlowTitleLeft: {
    color: colors.primaryDark,
    fontSize: 20,
    fontWeight: '900',
  },
  finishFlowSubtitleLeft: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  finishFlowFieldLabel: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  finishFlowKmGrid: {
    gap: spacing.xs,
  },
  finishFlowKmReadonly: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#E9EEF6',
    padding: spacing.sm,
    gap: spacing.xxs,
  },
  finishFlowKmInputWrap: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFD',
    padding: spacing.sm,
    gap: spacing.xxs,
  },
  finishFlowKmValue: {
    color: colors.primaryDark,
    fontSize: 17,
    fontWeight: '800',
  },
  finishFlowKmInput: {
    minHeight: 36,
    paddingVertical: 0,
    color: colors.primaryDark,
    fontSize: 18,
    fontWeight: '700',
  },
  finishFlowKmCameraButton: {
    minHeight: 42,
    marginTop: spacing.xxs,
  },
  finishFlowCameraUnavailable: {
    marginTop: spacing.xxs,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'left',
  },
  finishFlowOccurrencePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  finishFlowOccurrencePill: {
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
  finishFlowOccurrencePillSelected: {
    borderColor: '#34D399',
    backgroundColor: '#A7F3D0',
  },
  finishFlowOccurrencePillPressed: {
    opacity: 0.85,
  },
  finishFlowOccurrencePillText: {
    color: '#4B5563',
    fontSize: 12,
    fontWeight: '700',
  },
  finishFlowOccurrencePillTextSelected: {
    color: '#065F46',
  },
  finishFlowOccurrenceInputWrap: {
    gap: spacing.xxs,
  },
  finishFlowOccurrenceInput: {
    minHeight: 90,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFD',
    padding: spacing.sm,
    textAlignVertical: 'top',
    color: colors.text,
    fontSize: 14,
  },
  finishFlowActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  finishFlowActionButton: {
    flex: 1,
  },
  metricItem: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
  },
  metricLabel: {
    color: '#454C5A',
    fontSize: 13,
    fontWeight: '500',
  },
  metricValueRow: {
    gap: 1,
  },
  metricValue: {
    color: colors.primaryDark,
    fontSize: 17,
    fontWeight: '900',
  },
  footer: {
    marginTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  finishButton: {
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary,
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

