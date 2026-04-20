// ─── Sync logic ───────────────────────────────────────────────────────────────
// Fetches from Supabase, enriches with eligibility, saves to IndexedDB

import { supabase } from './supabase.js'
import { saveSchemes, getLastSync } from './db.js'

export async function syncFromSupabase({ force = false } = {}) {
  if (!navigator.onLine) return { status: 'offline' }

  try {
    // If not forced, only sync if last sync was >15 minutes ago
    if (!force) {
      const lastSync = await getLastSync()
      if (lastSync) {
        const diffMinutes = (Date.now() - new Date(lastSync).getTime()) / 60000
        if (diffMinutes < 15) return { status: 'fresh' }
      }
    }

    // Fetch schemes and eligibility in parallel
    const [{ data: schemes, error: err1 }, { data: eligibility, error: err2 }] = await Promise.all([
      supabase.from('schemes').select('*').eq('is_active', true).order('name'),
      supabase.from('scheme_eligibility').select('scheme_id, rule, attribute_definitions(key, label)'),
    ])

    if (err1 || err2) throw new Error((err1 || err2).message)

    // Enrich schemes with eligibility
    const enriched = schemes.map(s => ({
      ...s,
      eligibility: eligibility
        .filter(e => e.scheme_id === s.id)
        .map(e => ({
          attribute_key: e.attribute_definitions.key,
          attribute_label: e.attribute_definitions.label,
          rule: e.rule,
        })),
    }))

    await saveSchemes(enriched)
    return { status: 'updated', count: enriched.length }
  } catch (err) {
    return { status: 'error', message: err.message }
  }
}
