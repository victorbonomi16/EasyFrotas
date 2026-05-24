import { VEHICLE_STATUS } from '../utils/constants';
import { normalizeTagUid } from './Nfc';
import { supabase } from './supabaseClient';

export function normalizeVehiclePlate(value = '') {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export async function listVehicles({ empresaId, search = '' }) {
  let query = supabase
    .from('vehicles')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false });

  if (search) {
    query = query.or(`placa.ilike.%${search}%,modelo.ilike.%${search}%,marca.ilike.%${search}%`);
  }

  return query;
}

export async function findVehicleByPlate({ empresaId, plate }) {
  const normalizedPlate = normalizeVehiclePlate(plate);
  if (!normalizedPlate) {
    return { data: null, error: new Error('Placa inválida.') };
  }

  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('empresa_id', empresaId)
    .ilike('placa', `%${normalizedPlate}%`)
    .limit(20);

  if (error) {
    return { data: null, error };
  }

  const vehicle = (data ?? []).find((item) => normalizeVehiclePlate(item.placa) === normalizedPlate) ?? null;
  return { data: vehicle, error: null };
}

export async function findVehicleByNfcTag({ empresaId, tagUid }) {
  const normalizedUid = normalizeTagUid(tagUid);
  if (!normalizedUid) {
    return { data: null, error: new Error('TAG NFC inválida.') };
  }

  const { data, error } = await supabase
    .from('vehicle_nfc_tags')
    .select('id, tag_uid, vehicle:vehicles!inner(*)')
    .eq('empresa_id', empresaId)
    .eq('tag_uid', normalizedUid)
    .eq('ativo', true)
    .maybeSingle();

  if (error) {
    return { data: null, error };
  }

  return { data: data?.vehicle ?? null, error: null };
}

export async function findVehicleById({ empresaId, vehicleId }) {
  return supabase
    .from('vehicles')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('id', vehicleId)
    .maybeSingle();
}

export async function saveVehicle(vehicle) {
  const payload = {
    empresa_id: vehicle.empresa_id,
    placa: vehicle.placa,
    modelo: vehicle.modelo,
    marca: vehicle.marca ?? null,
    ano: vehicle.ano ?? null,
    cor: vehicle.cor ?? null,
    foto_url: vehicle.foto_url ?? null,
    km_atual: vehicle.km_atual ?? 0,
    status: vehicle.status ?? VEHICLE_STATUS.DISPONIVEL,
  };

  if (vehicle.id) {
    return supabase.from('vehicles').update(payload).eq('id', vehicle.id).select('*').single();
  }

  return supabase.from('vehicles').insert(payload).select('*').single();
}

export async function setVehicleStatus(id, status) {
  return supabase.from('vehicles').update({ status }).eq('id', id);
}

export async function listVehicleNfcTags({ empresaId, vehicleId }) {
  return supabase
    .from('vehicle_nfc_tags')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('vehicle_id', vehicleId)
    .order('created_at', { ascending: false });
}

export async function upsertVehicleNfcTag({
  empresaId,
  vehicleId,
  tagUid,
  tagLabel,
  tagPayload,
  createdBy,
}) {
  const normalizedUid = normalizeTagUid(tagUid);
  if (!normalizedUid) {
    return { data: null, error: new Error('TAG NFC inválida para cadastro.') };
  }

  return supabase
    .from('vehicle_nfc_tags')
    .upsert(
      {
        empresa_id: empresaId,
        vehicle_id: vehicleId,
        tag_uid: normalizedUid,
        tag_label: tagLabel?.trim() || null,
        tag_payload: tagPayload ?? null,
        ativo: true,
        created_by: createdBy ?? null,
      },
      {
        onConflict: 'tag_uid',
      },
    )
    .select('*')
    .single();
}

export async function setVehicleNfcTagStatus({ tagId, ativo }) {
  return supabase.from('vehicle_nfc_tags').update({ ativo }).eq('id', tagId);
}
