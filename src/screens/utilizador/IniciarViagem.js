import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Card } from '../../components/ui/Card';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { startTrip } from '../../services/Viagens';
import { colors, radius, shadows, spacing } from '../../theme/tokens';
import { formatKm, sanitizeNumber } from '../../utils/formatters';

function formatClock(value) {
  return new Date(value).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function IniciarViagem({ route, navigation }) {
  const vehicle = route.params?.vehicle;
  const [kmInicial, setKmInicial] = useState(String(vehicle?.km_atual ?? ''));
  const [destinoViagem, setDestinoViagem] = useState('');
  const [observacaoInicio, setObservacaoInicio] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentTimeLabel = useMemo(() => formatClock(new Date().toISOString()), []);

  if (!vehicle) {
    return (
      <ScreenContainer contentStyle={styles.content} safeEdges={['left', 'right', 'bottom']}>
        <Card style={styles.blockCard}>
          <Text style={styles.screenTitle}>Veículo não informado</Text>
          <PrimaryButton title="Voltar" onPress={() => navigation.goBack()} />
        </Card>
      </ScreenContainer>
    );
  }

  const onConfirm = async () => {
    const parsedKm = sanitizeNumber(kmInicial);
    if (parsedKm < 0) {
      Alert.alert('KM inválido', 'Informe uma quilometragem inicial válida.');
      return;
    }
    const kmAtualVeiculo = Number(vehicle?.km_atual ?? 0);
    if (Number.isFinite(kmAtualVeiculo) && parsedKm < kmAtualVeiculo) {
      Alert.alert('KM inválido', `O KM inicial deve ser maior ou igual a ${formatKm(kmAtualVeiculo)}.`);
      return;
    }
    const destino = destinoViagem.trim();
    if (!destino) {
      Alert.alert('Destino obrigatório', 'Informe o destino da viagem para continuar.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await startTrip({
        vehicleId: vehicle.id,
        kmInicial: parsedKm,
        destino,
        observacaoInicio: observacaoInicio.trim(),
      });
      if (error) {
        throw error;
      }
      navigation.navigate('AbasPrincipais', { screen: 'ViagemAtual' });
    } catch (error) {
      Alert.alert('Falha ao iniciar viagem', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenContainer contentStyle={styles.content} safeEdges={['left', 'right', 'bottom']}>
      <Card style={styles.vehicleCard}>
        <View style={styles.imageWrap}>
          {vehicle.foto_url ? (
            <Image source={{ uri: vehicle.foto_url }} style={styles.vehicleImage} resizeMode="cover" />
          ) : (
            <View style={styles.imageFallback}>
              <Ionicons name="car-sport-outline" size={58} color={colors.textMuted} />
              <Text style={styles.imageFallbackText}>Sem foto do veículo</Text>
            </View>
          )}
          <View style={styles.statusChip}>
            <Text style={styles.statusChipText}>{getVehicleStatusLabel(vehicle.status)}</Text>
          </View>
        </View>

        <View style={styles.mainInfoRow}>
          <View style={styles.mainInfoText}>
            <Text style={styles.vehicleName} numberOfLines={1}>
              {vehicle.modelo || 'Veículo'}
            </Text>
            <Text style={styles.vehicleCategory} numberOfLines={1}>
              {vehicle.marca || 'Veículo corporativo'}
            </Text>
          </View>
          <View style={styles.plateBox}>
            <Text style={styles.plateText} numberOfLines={1}>
              {vehicle.placa}
            </Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Ionicons name="speedometer-outline" size={18} color={colors.textMuted} />
            <View>
              <Text style={styles.metricLabel}>Último KM Registrado</Text>
              <Text style={styles.metricValue}>{formatKm(vehicle.km_atual)}</Text>
            </View>
          </View>
          <View style={styles.metricItem}>
            <Ionicons name="time-outline" size={18} color={colors.textMuted} />
            <View>
              <Text style={styles.metricLabel}>Horário Atual</Text>
              <Text style={styles.metricValue}>{currentTimeLabel}</Text>
            </View>
          </View>
        </View>
      </Card>

      <Card style={styles.blockCard}>
        <Text style={styles.fieldLabel}>KM Inicial Sugerido *</Text>
        <View style={styles.kmInputShell}>
          <Ionicons name="create-outline" size={22} color={colors.textMuted} />
          <TextInput
            value={kmInicial}
            onChangeText={setKmInicial}
            keyboardType="numeric"
            placeholder="45230"
            placeholderTextColor={colors.textMuted}
            style={styles.kmInput}
          />
          <Text style={styles.kmSuffix}>km</Text>
        </View>
        <Text style={[styles.fieldLabel, styles.destinationLabel]}>Destino da viagem *</Text>
        <TextInput
          value={destinoViagem}
          onChangeText={setDestinoViagem}
          placeholder="Ex: Filial Criciúma / Visita técnica / Reunião externa"
          placeholderTextColor={colors.textMuted}
          style={styles.destinationInput}
        />
        <Text style={[styles.fieldLabel, styles.obsLabel]}>Observação (Opcional)</Text>
        <TextInput
          value={observacaoInicio}
          onChangeText={setObservacaoInicio}
          placeholder="Ex: Quilometragem não bate com a do veículo"
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={3}
          style={styles.obsInput}
        />
      </Card>

      <Pressable
        accessibilityRole="button"
        onPress={onConfirm}
        disabled={isSubmitting}
        style={({ pressed }) => [
          styles.startButton,
          {
            opacity: isSubmitting ? 0.65 : pressed ? 0.9 : 1,
            transform: [{ scale: pressed ? 0.99 : 1 }],
          },
        ]}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#E7FFF6" size="small" />
        ) : (
          <View style={styles.startButtonContent}>
            <Ionicons name="play" size={20} color="#E7FFF6" />
            <Text style={styles.startButtonText}>Iniciar Viagem</Text>
          </View>
        )}
      </Pressable>

    </ScreenContainer>
  );
}

function getVehicleStatusLabel(status) {
  const map = {
    disponivel: 'Disponível',
    em_uso: 'Em uso',
    manutencao: 'Manutenção',
    inativo: 'Inativo',
  };
  return map[status] ?? 'Disponível';
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.sm,
  },
  blockCard: {
    gap: spacing.sm,
  },
  screenTitle: {
    color: colors.primaryDark,
    fontSize: 42 / 2,
    fontWeight: '900',
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
    backgroundColor: '#6EE7B7',
    borderWidth: 1,
    borderColor: '#34D399',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  statusChipText: {
    color: '#065F46',
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
  vehicleName: {
    color: colors.primaryDark,
    fontSize: 22 / 1.2,
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
  plateText: {
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
  metricValue: {
    color: colors.primaryDark,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 1,
  },
  fieldLabel: {
    color: '#353C48',
    fontSize: 16,
    fontWeight: '800',
  },
  kmInputShell: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#CDD5E1',
    borderRadius: radius.md,
    backgroundColor: '#FAFCFF',
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  kmInput: {
    flex: 1,
    color: colors.primaryDark,
    fontSize: 20,
    fontWeight: '700',
    paddingVertical: 0,
  },
  kmSuffix: {
    color: '#2D3441',
    fontSize: 17,
    fontWeight: '500',
    marginTop: 1,
  },
  obsLabel: {
    marginTop: spacing.xs,
  },
  destinationLabel: {
    marginTop: spacing.xs,
  },
  destinationInput: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#CDD5E1',
    borderRadius: radius.md,
    backgroundColor: '#FAFCFF',
    paddingHorizontal: spacing.md,
    paddingVertical: 0,
    fontSize: 16,
    color: '#1F2937',
  },
  obsInput: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: '#CDD5E1',
    borderRadius: radius.md,
    backgroundColor: '#FAFCFF',
    padding: spacing.md,
    fontSize: 16,
    color: '#1F2937',
    textAlignVertical: 'top',
  },
  startButton: {
    minHeight: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.soft,
  },
  startButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  startButtonText: {
    color: '#E7FFF6',
    fontSize: 34 / 1.7,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});

