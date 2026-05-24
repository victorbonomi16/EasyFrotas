import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { createClient, processLock } from '@supabase/supabase-js';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../utils/env';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
});

let isAppStateListenerBound = false;

if (Platform.OS !== 'web') {
  if (!isAppStateListenerBound) {
    if (AppState.currentState === 'active') {
      supabase.auth.startAutoRefresh();
    }
    AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
        return;
      }
      supabase.auth.stopAutoRefresh();
    });
    isAppStateListenerBound = true;
  }
}
