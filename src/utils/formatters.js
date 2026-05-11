export function formatDateTime(value) {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(value) {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleDateString('pt-BR');
}

export function formatKm(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '-';
  }
  return `${Number(value).toLocaleString('pt-BR')} km`;
}

export function formatDistance(kmInicial, kmFinal) {
  if (kmInicial === null || kmFinal === null || kmInicial === undefined || kmFinal === undefined) {
    return '-';
  }
  return formatKm(Number(kmFinal) - Number(kmInicial));
}

export function sanitizeNumber(value) {
  if (!value) {
    return 0;
  }
  return Number(String(value).replace(',', '.').replace(/[^\d.-]/g, '')) || 0;
}

