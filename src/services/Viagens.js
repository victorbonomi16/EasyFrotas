import { TRIP_STATUS } from '../utils/constants';
import { supabase } from './supabaseClient';

export async function obterViagemAbertaPorUtilizador({ idUtilizador, empresaId }) {
  return supabase
    .from('trips')
    .select('*, vehicles (placa, modelo, marca, cor, foto_url), trip_occurrences(*)')
    .eq('user_id', idUtilizador)
    .eq('empresa_id', empresaId)
    .eq('status', TRIP_STATUS.EM_ANDAMENTO)
    .maybeSingle();
}

export async function startTrip({ vehicleId, kmInicial, destino, observacaoInicio }) {
  return supabase.rpc('start_trip', {
    p_vehicle_id: vehicleId,
    p_km_inicial: kmInicial,
    p_destino: destino ?? null,
    p_observacao_inicio: observacaoInicio ?? null,
  });
}

export async function finishTrip({
  tripId,
  kmFinal,
  observacaoFim,
  occurrenceType,
  occurrenceDescription,
}) {
  return supabase.rpc('finish_trip', {
    p_trip_id: tripId,
    p_km_final: kmFinal,
    p_observacao_fim: observacaoFim ?? null,
    p_occurrence_type: occurrenceType ?? null,
    p_occurrence_description: occurrenceDescription ?? null,
  });
}

export async function listTrips({ profile, periodDays = 30 }) {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - periodDays);

  let query = supabase
    .from('trips')
    .select('*, vehicles (placa, modelo, marca), profiles (nome), trip_occurrences(*)')
    .eq('empresa_id', profile.empresa_id)
    .gte('created_at', fromDate.toISOString())
    .order('created_at', { ascending: false });

  if (profile.perfil !== 'gestor') {
    query = query.eq('user_id', profile.id);
  }

  return query;
}


