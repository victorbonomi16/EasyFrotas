import { Platform } from 'react-native';
import NfcManager, { Ndef, NfcTech } from 'react-native-nfc-manager';

let hasStarted = false;

function toSafeString(value) {
  return String(value ?? '').trim();
}

export function normalizeTagUid(value = '') {
  return toSafeString(value)
    .replace(/[^a-fA-F0-9]/g, '')
    .toUpperCase();
}

function buildVehicleTagPayload(vehicle) {
  return JSON.stringify({
    app: 'easyfrotas',
    vehicle_id: vehicle.id,
    placa: vehicle.placa,
    created_at: new Date().toISOString(),
  });
}

function extractTextPayloadFromTag(tag) {
  const records = Array.isArray(tag?.ndefMessage) ? tag.ndefMessage : [];
  for (const record of records) {
    if (Ndef.isType(record, Ndef.TNF_WELL_KNOWN, Ndef.RTD_TEXT)) {
      try {
        return Ndef.text.decodePayload(record.payload);
      } catch (error) {
        return null;
      }
    }
  }
  return null;
}

async function ensureNfcReady() {
  try {
    if (!hasStarted) {
      await NfcManager.start();
      hasStarted = true;
    }

    const isSupported = await NfcManager.isSupported();
    if (!isSupported) {
      throw new Error('Este dispositivo não possui suporte a NFC.');
    }

    const isEnabled = await NfcManager.isEnabled();
    if (!isEnabled) {
      throw new Error('NFC desativado. Ative o NFC nas configurações e tente novamente.');
    }
  } catch (error) {
    const message = toSafeString(error?.message).toLowerCase();
    if (message.includes('native module') || message.includes('null') || message.includes('not available')) {
      throw new Error('NFC indisponível neste build. Gere um build nativo (expo run/eas build) para usar TAGs NFC.');
    }
    throw error;
  }
}

async function closeTechnologyRequest() {
  try {
    await NfcManager.cancelTechnologyRequest();
  } catch (error) {
    // Ignora erro de cancelamento para não interromper o fluxo principal.
  }
}

export function isNfcCancelError(error) {
  const message = toSafeString(error?.message).toLowerCase();
  return (
    message.includes('cancel') ||
    message.includes('cancelled') ||
    message.includes('canceled') ||
    message.includes('user cancel')
  );
}

export async function scanNfcTag({ alertMessage = 'Aproxime a TAG NFC do celular.' } = {}) {
  await ensureNfcReady();

  try {
    await NfcManager.requestTechnology(NfcTech.Ndef, { alertMessage });
    const tag = await NfcManager.getTag();
    const tagUid = normalizeTagUid(tag?.id);

    if (!tagUid) {
      throw new Error('Não foi possível identificar a TAG NFC. Tente novamente.');
    }

    const ndefTextPayload = extractTextPayloadFromTag(tag);
    if (Platform.OS === 'ios') {
      await NfcManager.setAlertMessageIOS('TAG lida com sucesso.');
    }

    return { tag, tagUid, ndefTextPayload };
  } finally {
    await closeTechnologyRequest();
  }
}

export async function writeVehicleTag({ vehicle }) {
  if (!vehicle?.id) {
    throw new Error('Veículo inválido para gravação da TAG.');
  }

  await ensureNfcReady();
  const payload = buildVehicleTagPayload(vehicle);

  try {
    await NfcManager.requestTechnology(NfcTech.Ndef, {
      alertMessage: 'Aproxime a TAG NFC para gravar o vínculo com o veículo.',
    });

    const tag = await NfcManager.getTag();
    const tagUid = normalizeTagUid(tag?.id);

    if (!tagUid) {
      throw new Error('Não foi possível ler o identificador da TAG.');
    }

    const bytes = Ndef.encodeMessage([Ndef.textRecord(payload)]);
    await NfcManager.ndefHandler.writeNdefMessage(bytes);

    if (Platform.OS === 'ios') {
      await NfcManager.setAlertMessageIOS('TAG gravada com sucesso.');
    }

    return { tagUid, payload };
  } finally {
    await closeTechnologyRequest();
  }
}
