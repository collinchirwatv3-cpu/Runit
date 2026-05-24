import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://fueyjsdmxjxwtxhxffva.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1ZXlqc2RteGp4d3R4aHhmZnZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MzQ1MjksImV4cCI6MjA5NDExMDUyOX0.dUwuMXGw2CUxRHf_O1Bebl_uzoZyMn6RGc50o0yx0sU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: Platform.OS !== 'web' ? AsyncStorage : undefined,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
