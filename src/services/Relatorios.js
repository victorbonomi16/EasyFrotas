import { supabase } from './supabaseClient';

export async function getFleetSummary({ empresaId, periodDays = 30, vehicleId = null }) {
  return supabase.rpc('get_fleet_report', {
    p_empresa_id: empresaId,
    p_period_days: periodDays,
    p_vehicle_id: vehicleId,
  });
}

