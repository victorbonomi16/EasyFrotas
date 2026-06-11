import { VEHICLE_STATUS } from '../utils/constants';
import { normalizeTagPayloadCode, normalizeTagUid } from './Nfc';
import { supabase } from './supabaseClient';

const SECURE_TAG_PAYLOAD_PATTERN = /^[A-F0-9]{32}$/;

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

export async function findVehicleByNfcTag({ empresaId, tagUid, tagPayload }) {
  const normalizedPayload = normalizeTagPayloadCode(tagPayload);
  const normalizedUid = normalizeTagUid(tagUid);

  if (!normalizedPayload && !normalizedUid) {
    return { data: null, error: new Error('TAG NFC inválida.') };
  }

  if (normalizedPayload) {
    const { data, error } = await supabase
      .from('vehicle_nfc_tags')
      .select('id, tag_uid, tag_payload, vehicle:vehicles!inner(*)')
      .eq('empresa_id', empresaId)
      .eq('tag_payload', normalizedPayload)
      .eq('ativo', true)
      .maybeSingle();

    if (error || data?.vehicle) {
      return { data: data?.vehicle ?? null, error };
    }

    if (SECURE_TAG_PAYLOAD_PATTERN.test(normalizedPayload)) {
      return { data: null, error: null };
    }
  }

  if (!normalizedUid) {
    return { data: null, error: null };
  }

  const { data, error } = await supabase
    .from('vehicle_nfc_tags')
    .select('id, tag_uid, tag_payload, vehicle:vehicles!inner(*)')
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
  if (!id) {
    return { data: null, error: new Error('Veículo inválido.') };
  }

  if (!Object.values(VEHICLE_STATUS).includes(status)) {
    return { data: null, error: new Error('Status de veículo inválido.') };
  }

  if (status === VEHICLE_STATUS.INATIVO) {
    const { data: vehicle, error: vehicleError } = await supabase
      .from('vehicles')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (vehicleError) {
      return { data: null, error: vehicleError };
    }

    if (!vehicle) {
      return { data: null, error: new Error('Veículo não encontrado.') };
    }

    if (vehicle.status === VEHICLE_STATUS.EM_USO) {
      return {
        data: null,
        error: new Error('Não é possível inativar um veículo com viagem em andamento.'),
      };
    }

    const { data: openTrip, error: tripError } = await supabase
      .from('trips')
      .select('id')
      .eq('vehicle_id', id)
      .eq('status', 'em_andamento')
      .limit(1)
      .maybeSingle();

    if (tripError) {
      return { data: null, error: tripError };
    }

    if (openTrip) {
      return {
        data: null,
        error: new Error('Não é possível inativar um veículo com viagem em andamento.'),
      };
    }
  }

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
  const normalizedPayload = normalizeTagPayloadCode(tagPayload);
  if (!normalizedUid) {
    return { data: null, error: new Error('TAG NFC inválida para cadastro.') };
  }
  if (!normalizedPayload) {
    return { data: null, error: new Error('Código seguro da TAG inválido para cadastro.') };
  }

  return supabase
    .from('vehicle_nfc_tags')
    .upsert(
      {
        empresa_id: empresaId,
        vehicle_id: vehicleId,
        tag_uid: normalizedUid,
        tag_label: tagLabel?.trim() || null,
        tag_payload: normalizedPayload,
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
