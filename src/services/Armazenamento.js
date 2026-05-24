import * as FileSystemLegacy from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

import { supabase } from './supabaseClient';

const VEHICLE_PHOTOS_BUCKET = 'vehicle-photos';
const BASE64_ENCODING = FileSystemLegacy.EncodingType?.Base64 ?? 'base64';

function normalizeFilename(value = '') {
  const withoutExtension = value.replace(/\.[a-z0-9]+$/i, '');
  return withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/(^-|-$)/g, '');
}

function getFileExtension(asset = {}) {
  const namePart = asset.fileName || asset.uri?.split('/').pop() || '';
  const dotPart = namePart.includes('.') ? namePart.split('.').pop()?.toLowerCase() : '';
  if (dotPart) {
    return dotPart;
  }
  if (asset.mimeType === 'image/png') {
    return 'png';
  }
  if (asset.mimeType === 'image/webp') {
    return 'webp';
  }
  return 'jpg';
}

export function extractPathFromPublicUrl(url = '') {
  if (!url) {
    return null;
  }
  const marker = `/storage/v1/object/public/${VEHICLE_PHOTOS_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx < 0) {
    return null;
  }
  return decodeURIComponent(url.slice(idx + marker.length));
}

export async function removeVehiclePhotoByPublicUrl(url = '') {
  const filePath = extractPathFromPublicUrl(url);
  if (!filePath) {
    return { error: null };
  }
  return supabase.storage.from(VEHICLE_PHOTOS_BUCKET).remove([filePath]);
}

export async function uploadVehiclePhoto({ empresaId, vehicleId, asset }) {
  if (!asset?.uri) {
    throw new Error('Imagem inválida para upload.');
  }

  const extension = getFileExtension(asset);
  const now = Date.now();
  const safeName = normalizeFilename(asset.fileName || `vehicle-${now}`) || `vehicle-${now}`;
  const filePath = `${empresaId || 'company'}/${vehicleId || 'draft'}/${now}-${safeName}.${extension}`;

  const base64FileData = await FileSystemLegacy.readAsStringAsync(asset.uri, {
    encoding: BASE64_ENCODING,
  });
  const fileArrayBuffer = decode(base64FileData);

  const contentType = asset.mimeType || (extension === 'png' ? 'image/png' : 'image/jpeg');
  const { error: uploadError } = await supabase.storage
    .from(VEHICLE_PHOTOS_BUCKET)
    .upload(filePath, fileArrayBuffer, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(VEHICLE_PHOTOS_BUCKET).getPublicUrl(filePath);
  return {
    bucket: VEHICLE_PHOTOS_BUCKET,
    path: filePath,
    publicUrl: data.publicUrl,
  };
}

