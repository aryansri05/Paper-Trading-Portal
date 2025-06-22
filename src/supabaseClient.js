// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

console.log('--- Inside supabaseClient.js ---');
const supabaseUrl = 'https://xfxuljourgdgiuzfcohq.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmeHVsam91cmdkZ2l1emZjb2hxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4MDI1ODgsImV4cCI6MjA2NDM3ODU4OH0.hkwjAjTyq4oLwKzFjvFGymiQVwdutSWszW5OlFliRZA'

console.log('SUPABASE_URL (hardcoded):', supabaseUrl);
console.log('SUPABASE_ANON_KEY (hardcoded):', supabaseAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
console.log('Supabase client object after creation:', supabase);
console.log('---------------------------------');