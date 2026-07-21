import { createClient } from '@supabase/supabase-js';

// URL dan Key diambil dari data yang lo kasih
const supabaseUrl = 'https://uyqloxzcykyswrdxnhla.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5cWxveHpjeWt5c3dyZHhuaGxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NTA3MjQsImV4cCI6MjEwMDIyNjcyNH0.lNJWGPYYMFw2_1dLV7pzjM9YIH0cbcFdtKRD5wuQZa4';

// Export client biar bisa dipanggil di file HTML/JS lain
export const supabase = createClient(supabaseUrl, supabaseKey);
