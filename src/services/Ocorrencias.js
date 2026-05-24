import { supabase } from './supabaseClient';

export async function listOccurrences({ empresaId, status }) {
  let query = supabase
    .from('trip_occurrences')
    .select(
      '*, trips!inner(started_at, ended_at, user_id, vehicle_id, empresa_id, vehicles(placa, modelo), profiles(nome))',
    )
    .eq('trips.empresa_id', empresaId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  return query;
}

export async function updateOccurrenceStatus(id, status) {
  return supabase.from('trip_occurrences').update({ status }).eq('id', id).select('*').single();
}

