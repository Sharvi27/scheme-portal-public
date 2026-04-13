import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://fnvkzvzagammbzisboxe.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZudmt6dnphZ2FtbWJ6aXNib3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwNDI3MzYsImV4cCI6MjA5MTYxODczNn0._CX9PPdXxMuTkktqNUk1YadhYwAJJpYaivK4FMxiIZQ'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
