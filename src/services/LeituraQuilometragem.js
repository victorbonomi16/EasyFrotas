import Constants from 'expo-constants';

const isExpoGo =
  Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === 'storeClient';

let recognizeTextFn = null;

function getRecognizeText() {
  if (isExpoGo) {
    throw new Error(
      'Leitura por câmera desativada no Expo Go. Use a APK para testar esse recurso.'
    );
  }

  if (!recognizeTextFn) {
    const mod = require('@infinitered/react-native-mlkit-text-recognition');
    recognizeTextFn = mod?.recognizeText;
  }

  if (typeof recognizeTextFn !== 'function') {
    throw new Error('Módulo de leitura por câmera não disponível neste build.');
  }

  return recognizeTextFn;
}

export function leituraCameraDisponivel() {
  return !isExpoGo;
}

function normalizarTexto(texto) {
  return String(texto ?? '')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function limparNumero(texto) {
  return String(texto ?? '').replace(/\D/g, '');
}

function obterPontuacaoCandidato(fragmentoOriginal, textoCompleto) {
  let score = 0;
  const fragmento = fragmentoOriginal.toLowerCase();

  if (fragmento.includes('km')) {
    score += 100;
  }

  const texto = textoCompleto.toLowerCase();
  if (texto.includes('odometro') || texto.includes('hodometro') || texto.includes('odômetro')) {
    score += 20;
  }

  return score;
}

export function extrairQuilometragemDoTexto(textoOcr) {
  const texto = normalizarTexto(textoOcr);
  if (!texto) {
    return null;
  }

  const regex = /\d[\d.,\s]{1,12}\d|\d{3,7}/g;
  const matches = texto.match(regex) ?? [];
  const candidatos = [];

  for (const match of matches) {
    const digitos = limparNumero(match);
    if (!digitos) {
      continue;
    }

    // Faixa pratica para odometro de frota.
    if (digitos.length < 3 || digitos.length > 7) {
      continue;
    }

    const valor = Number.parseInt(digitos, 10);
    if (!Number.isFinite(valor) || valor <= 0) {
      continue;
    }

    const score = obterPontuacaoCandidato(match, texto) + valor / 100000;
    candidatos.push({ valor, score });
  }

  if (candidatos.length === 0) {
    return null;
  }

  candidatos.sort((a, b) => b.score - a.score);
  return candidatos[0].valor;
}

export async function lerQuilometragemDoPainel(uriImagem) {
  if (!uriImagem) {
    throw new Error('Imagem inválida para leitura do painel.');
  }

  const recognizeText = getRecognizeText();
  const resultado = await recognizeText(uriImagem);
  const texto = normalizarTexto(resultado?.text);
  const kmDetectado = extrairQuilometragemDoTexto(texto);

  if (!kmDetectado) {
    throw new Error(
      'Não foi possível identificar o KM do painel. Tente novamente com melhor foco e iluminação.'
    );
  }

  return {
    kmDetectado,
    textoLido: texto,
  };
}
