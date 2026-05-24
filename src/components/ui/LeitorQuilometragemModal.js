import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { lerQuilometragemDoPainel } from '../../services/LeituraQuilometragem';
import { colors, radius, shadows, spacing } from '../../theme/tokens';
import { formatKm, sanitizeNumber } from '../../utils/formatters';

const ETAPA = {
  CAMERA: 'camera',
  CONFIRMACAO: 'confirmacao',
};

export function LeitorQuilometragemModal({
  visible,
  onClose,
  onConfirmKm,
  minKm = 0,
  titulo = 'Leitura de quilometragem',
  subtitulo = 'Posicione o odômetro dentro da moldura para leitura automática.',
}) {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [etapa, setEtapa] = useState(ETAPA.CAMERA);
  const [isProcessing, setIsProcessing] = useState(false);
  const [kmConfirmacao, setKmConfirmacao] = useState('');
  const [erroLeitura, setErroLeitura] = useState('');
  const [erroValidacao, setErroValidacao] = useState('');
  const animCard = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      setEtapa(ETAPA.CAMERA);
      setIsProcessing(false);
      setKmConfirmacao('');
      setErroLeitura('');
      setErroValidacao('');
      animCard.setValue(0);
      return;
    }

    Animated.spring(animCard, {
      toValue: 1,
      useNativeDriver: true,
      damping: 16,
      stiffness: 180,
      mass: 0.8,
    }).start();
  }, [animCard, visible]);

  useEffect(() => {
    if (!visible || !permission || permission.granted || !permission.canAskAgain) {
      return;
    }
    requestPermission();
  }, [permission, requestPermission, visible]);

  const animCardStyle = useMemo(
    () => ({
      opacity: animCard,
      transform: [
        {
          translateY: animCard.interpolate({
            inputRange: [0, 1],
            outputRange: [24, 0],
          }),
        },
      ],
    }),
    [animCard],
  );

  const onCaptureKm = async () => {
    if (!cameraRef.current || isProcessing) {
      return;
    }

    setErroLeitura('');
    setErroValidacao('');
    setIsProcessing(true);
    try {
      const foto = await cameraRef.current.takePictureAsync({
        quality: 0.75,
        skipProcessing: false,
      });

      const { kmDetectado } = await lerQuilometragemDoPainel(foto?.uri);
      setKmConfirmacao(String(kmDetectado));
      setEtapa(ETAPA.CONFIRMACAO);
    } catch (error) {
      setErroLeitura(error?.message ?? 'Não foi possível ler o KM automaticamente.');
    } finally {
      setIsProcessing(false);
    }
  };

  const onConfirmarKm = () => {
    const valor = sanitizeNumber(kmConfirmacao);

    if (!Number.isFinite(valor) || valor <= 0) {
      setErroValidacao('Informe uma quilometragem válida para continuar.');
      return;
    }

    if (Number.isFinite(minKm) && valor < minKm) {
      setErroValidacao(`O KM final deve ser maior ou igual a ${formatKm(minKm)}.`);
      return;
    }

    setErroValidacao('');
    onConfirmKm?.(valor);
    onClose?.();
  };

  const onAbrirConfirmacaoManual = () => {
    setErroValidacao('');
    setEtapa(ETAPA.CONFIRMACAO);
  };

  const onSolicitarPermissao = async () => {
    const result = await requestPermission();
    if (!result?.granted) {
      Alert.alert('Permissão necessária', 'Permita o uso da câmera para ler a quilometragem do painel.');
    }
  };

  const cameraDisponivel = Boolean(permission?.granted);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {etapa === ETAPA.CAMERA ? (
          <View style={styles.cameraContainer}>
            {cameraDisponivel ? (
              <CameraView ref={cameraRef} style={styles.cameraPreview} facing="back" autofocus="on" />
            ) : (
              <View style={styles.permissionWrap}>
                <Ionicons name="camera-outline" size={44} color={colors.primaryDark} />
                <Text style={styles.permissionTitle}>Permissão de câmera</Text>
                <Text style={styles.permissionSubtitle}>
                  Precisamos da câmera para identificar automaticamente a quilometragem.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={onSolicitarPermissao}
                  style={({ pressed }) => [styles.permissionButton, pressed ? styles.buttonPressed : null]}
                >
                  <Text style={styles.permissionButtonText}>Permitir câmera</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.cameraHudTop}>
              <Text style={styles.hudTitle}>{titulo}</Text>
              <Text style={styles.hudSubtitle}>{subtitulo}</Text>
            </View>

            <View style={styles.frameWrap}>
              <View style={styles.frameGuide}>
                <View style={[styles.corner, styles.cornerTopLeft]} />
                <View style={[styles.corner, styles.cornerTopRight]} />
                <View style={[styles.corner, styles.cornerBottomLeft]} />
                <View style={[styles.corner, styles.cornerBottomRight]} />
              </View>
              <Text style={styles.frameHint}>Centralize apenas a área do odômetro.</Text>
            </View>

            {erroLeitura ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={16} color="#B42318" />
                <Text style={styles.errorBannerText}>{erroLeitura}</Text>
              </View>
            ) : null}

            <View style={styles.cameraActions}>
              <Pressable
                accessibilityRole="button"
                onPress={onClose}
                style={({ pressed }) => [styles.actionButtonOutline, pressed ? styles.buttonPressed : null]}
              >
                <Text style={styles.actionButtonOutlineText}>Cancelar</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={onCaptureKm}
                disabled={!cameraDisponivel || isProcessing}
                style={({ pressed }) => [
                  styles.actionButtonPrimary,
                  (!cameraDisponivel || isProcessing) ? styles.actionButtonDisabled : null,
                  pressed ? styles.buttonPressed : null,
                ]}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.actionButtonPrimaryText}>Ler KM</Text>
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={onAbrirConfirmacaoManual}
                style={({ pressed }) => [styles.actionButtonOutline, pressed ? styles.buttonPressed : null]}
              >
                <Text style={styles.actionButtonOutlineText}>Manual</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Animated.View style={[styles.confirmCardWrap, animCardStyle]}>
            <View style={styles.confirmCard}>
              <View style={styles.confirmIconWrap}>
                <Ionicons name="speedometer-outline" size={28} color={colors.primaryDark} />
              </View>
              <Text style={styles.confirmTitle}>Confirme a quilometragem</Text>
              <Text style={styles.confirmSubtitle}>Revise o valor lido e ajuste se necessário.</Text>

              <View style={styles.confirmInputShell}>
                <TextInput
                  value={kmConfirmacao}
                  onChangeText={setKmConfirmacao}
                  keyboardType="numeric"
                  placeholder="Ex: 45230"
                  placeholderTextColor={colors.textMuted}
                  style={styles.confirmInput}
                />
                <Text style={styles.confirmInputSuffix}>km</Text>
              </View>

              {Number.isFinite(minKm) && minKm > 0 ? (
                <Text style={styles.confirmHint}>Referência mínima: {formatKm(minKm)}</Text>
              ) : null}

              {erroValidacao ? <Text style={styles.validationText}>{erroValidacao}</Text> : null}

              <View style={styles.confirmActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setEtapa(ETAPA.CAMERA)}
                  style={({ pressed }) => [styles.confirmBackButton, pressed ? styles.buttonPressed : null]}
                >
                  <Text style={styles.confirmBackButtonText}>Ler novamente</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={onConfirmarKm}
                  style={({ pressed }) => [styles.confirmPrimaryButton, pressed ? styles.buttonPressed : null]}
                >
                  <Text style={styles.confirmPrimaryButtonText}>Usar KM</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  cameraContainer: {
    flex: 1,
  },
  cameraPreview: {
    ...StyleSheet.absoluteFillObject,
  },
  permissionWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF3F9',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  permissionTitle: {
    color: colors.primaryDark,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  permissionSubtitle: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  permissionButton: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  cameraHudTop: {
    marginTop: spacing.xl + spacing.md,
    marginHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#D7DEE8',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xxs,
    ...shadows.soft,
  },
  hudTitle: {
    color: colors.primaryDark,
    fontSize: 18,
    fontWeight: '900',
  },
  hudSubtitle: {
    color: '#374151',
    fontSize: 13,
    lineHeight: 18,
  },
  frameWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  frameGuide: {
    width: '82%',
    maxWidth: 360,
    aspectRatio: 2.45,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#6EE7B7',
  },
  cornerTopLeft: {
    top: -2,
    left: -2,
    borderLeftWidth: 4,
    borderTopWidth: 4,
    borderTopLeftRadius: radius.sm,
  },
  cornerTopRight: {
    top: -2,
    right: -2,
    borderRightWidth: 4,
    borderTopWidth: 4,
    borderTopRightRadius: radius.sm,
  },
  cornerBottomLeft: {
    bottom: -2,
    left: -2,
    borderLeftWidth: 4,
    borderBottomWidth: 4,
    borderBottomLeftRadius: radius.sm,
  },
  cornerBottomRight: {
    bottom: -2,
    right: -2,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderBottomRightRadius: radius.sm,
  },
  frameHint: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  errorBanner: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  errorBannerText: {
    flex: 1,
    color: '#B42318',
    fontSize: 12,
    fontWeight: '700',
  },
  cameraActions: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.lg,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  actionButtonOutline: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#D7DEE8',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonOutlineText: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: '800',
  },
  actionButtonPrimary: {
    flex: 1.25,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.55,
  },
  actionButtonPrimaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  buttonPressed: {
    opacity: 0.88,
  },
  confirmCardWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 430,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#D8E0EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
    ...shadows.medium,
  },
  confirmIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    borderColor: '#D7DEE8',
    backgroundColor: '#EFF4FB',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  confirmTitle: {
    color: colors.primaryDark,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  confirmSubtitle: {
    color: colors.text,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  confirmInputShell: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: radius.md,
    backgroundColor: '#F8FAFD',
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  confirmInput: {
    flex: 1,
    color: colors.primaryDark,
    fontSize: 21,
    fontWeight: '800',
    paddingVertical: 0,
  },
  confirmInputSuffix: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmHint: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  validationText: {
    color: '#B42318',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  confirmActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  confirmBackButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#CCD8E8',
    backgroundColor: '#F8FAFD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBackButtonText: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: '800',
  },
  confirmPrimaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});
