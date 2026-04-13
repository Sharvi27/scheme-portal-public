import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase.js'

// ─── Income category hierarchy ───────────────────────────────────────────────
// BPL ⊂ low_income ⊂ general
// If a scheme requires "low_income", BPL users also qualify
const INCOME_HIERARCHY = { bpl: 0, low_income: 1, general: 2 }

function userMeetsRule(userProfile, attribute_key, rule) {
  const val = userProfile[attribute_key]
  if (val === undefined || val === null || val === '') return true // user didn't specify → don't filter out

  switch (attribute_key) {
    case 'age':
    case 'annual_income': {
      const num = Number(val)
      if (isNaN(num)) return true
      if (rule.min !== undefined && num < rule.min) return false
      if (rule.max !== undefined && num > rule.max) return false
      return true
    }
    case 'income_category': {
      if (!rule.required) return true
      // scheme requires a certain category or below
      return INCOME_HIERARCHY[val] <= INCOME_HIERARCHY[rule.required]
    }
    case 'gender': {
      if (!rule.allowed || rule.allowed.includes('any')) return true
      return rule.allowed.includes(val)
    }
    case 'sector':
    case 'state': {
      if (!rule.allowed || rule.allowed.includes('any')) return true
      return rule.allowed.includes(val)
    }
    case 'is_widow':
    case 'has_bank_account':
    case 'is_disabled': {
      // rule.required: true means user must have this
      // rule.required: false means user must NOT have this
      if (rule.required === true && val !== true) return false
      if (rule.required === false && val !== false) return false
      return true
    }
    default:
      return true
  }
}

function schemeMatchesProfile(scheme, userProfile) {
  if (!scheme.eligibility || scheme.eligibility.length === 0) return true
  return scheme.eligibility.every(({ attribute_key, rule }) =>
    userMeetsRule(userProfile, attribute_key, rule)
  )
}

// ─── Components ──────────────────────────────────────────────────────────────

function Header() {
  return (
    <header style={{
      background: `linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%)`,
      color: 'white',
      padding: '0',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* decorative circles */}
      <div style={{
        position: 'absolute', top: -60, right: -60, width: 220, height: 220,
        borderRadius: '50%', background: 'rgba(232,131,42,0.12)', pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute', bottom: -40, left: '40%', width: 140, height: 140,
        borderRadius: '50%', background: 'rgba(232,131,42,0.08)', pointerEvents: 'none'
      }} />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '36px 24px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: 'linear-gradient(135deg, var(--saffron), var(--saffron-light))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, flexShrink: 0,
          }}>🏛️</div>
          <div>
            <h1 style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)', fontWeight: 700, letterSpacing: '-0.5px' }}>
              Welfare Scheme Finder
            </h1>
            <p style={{ fontSize: '0.85rem', opacity: 0.7, marginTop: 2, fontWeight: 300 }}>
              Delhi &amp; Central Government Schemes
            </p>
          </div>
        </div>
        <p style={{ fontSize: '0.95rem', opacity: 0.85, maxWidth: 560, marginTop: 12, fontWeight: 300 }}>
          Enter your details below to find all government schemes you may be eligible for.
        </p>
      </div>
    </header>
  )
}

function Label({ children }) {
  return (
    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
      {children}
    </label>
  )
}

const inputStyle = {
  width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)',
  borderRadius: 'var(--radius-sm)', background: 'white', fontSize: '0.93rem',
  color: 'var(--text)', outline: 'none', transition: 'border-color 0.2s',
}

function ProfileForm({ profile, onChange, onSearch, loading }) {
  const handleFocus = e => e.target.style.borderColor = 'var(--saffron)'
  const handleBlur  = e => e.target.style.borderColor = 'var(--border)'

  const toggleBoolean = (key) => {
    // cycles: null → true → false → null
    const cur = profile[key]
    const next = cur === null ? true : cur === true ? false : null
    onChange(key, next)
  }

  const BoolToggle = ({ fieldKey, label }) => {
    const val = profile[fieldKey]
    return (
      <div>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {label}
        </span>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          {[{ v: null, l: 'Any' }, { v: true, l: 'Yes' }, { v: false, l: 'No' }].map(({ v, l }) => (
            <button key={String(v)} onClick={() => onChange(fieldKey, v)} style={{
              flex: 1, padding: '8px 4px', borderRadius: 'var(--radius-sm)',
              border: '1.5px solid', fontSize: '0.85rem', fontWeight: 500,
              borderColor: val === v ? 'var(--saffron)' : 'var(--border)',
              background: val === v ? 'var(--saffron)' : 'white',
              color: val === v ? 'white' : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}>{l}</button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'white', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
      padding: '28px 24px', border: '1px solid var(--border)',
    }}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 20, color: 'var(--navy)' }}>
        Your Details
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Age */}
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Age</label>
          <input type="number" placeholder="e.g. 35" value={profile.age || ''} min={0} max={120}
            onChange={e => onChange('age', e.target.value)}
            onFocus={handleFocus} onBlur={handleBlur}
            style={inputStyle}
          />
        </div>

        {/* Gender */}
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Gender</label>
          <select value={profile.gender || ''} onChange={e => onChange('gender', e.target.value)}
            onFocus={handleFocus} onBlur={handleBlur} style={inputStyle}>
            <option value="">Select</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>

        {/* Annual Income */}
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Annual Income (₹)</label>
          <input type="number" placeholder="e.g. 120000" value={profile.annual_income || ''}
            onChange={e => onChange('annual_income', e.target.value)}
            onFocus={handleFocus} onBlur={handleBlur}
            style={inputStyle}
          />
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>≤₹1L = BPL · ₹1L–₹3L = Low Income · &gt;₹3L = General</p>
        </div>

        {/* Income Category */}
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
            Income Category {profile.annual_income && <span style={{ color: 'var(--saffron)', fontSize: '0.7rem', fontWeight: 500 }}>(auto-set)</span>}
          </label>
          <select value={profile.income_category || ''} onChange={e => onChange('income_category', e.target.value)}
            onFocus={handleFocus} onBlur={handleBlur}
            style={{ ...inputStyle, background: profile.annual_income ? '#fffbf5' : 'white', borderColor: profile.annual_income ? 'var(--saffron)' : 'var(--border)' }}>
            <option value="">Select</option>
            <option value="bpl">BPL (Below Poverty Line)</option>
            <option value="low_income">Low Income</option>
            <option value="general">General</option>
          </select>
          {profile.annual_income && <p style={{ fontSize: '0.72rem', color: 'var(--saffron)', marginTop: 4 }}>Auto-derived from income. Select manually to override (clears income).</p>}
        </div>

        {/* Sector */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Employment Sector</label>
          <select value={profile.sector || ''} onChange={e => onChange('sector', e.target.value)}
            onFocus={handleFocus} onBlur={handleBlur} style={inputStyle}>
            <option value="">Select</option>
            <option value="unorganised">Unorganised Sector</option>
            <option value="organised">Organised Sector</option>
          </select>
        </div>
      </div>

      {/* Boolean toggles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 16 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>State / Location</span>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {[['', 'Not Specified'], ['delhi', '🏙️ Delhi'], ['haryana', '🟢 Haryana'], ['other', '🗺️ Other']].map(([v, l]) => (
              <button key={v} onClick={() => onChange('state', v)} style={{
                flex: 1, padding: '8px 4px', borderRadius: 'var(--radius-sm)',
                border: '1.5px solid', fontSize: '0.82rem', fontWeight: 500,
                borderColor: profile.state === v ? 'var(--saffron)' : 'var(--border)',
                background: profile.state === v ? 'var(--saffron)' : 'white',
                color: profile.state === v ? 'white' : 'var(--text-muted)',
                transition: 'all 0.15s', cursor: 'pointer',
              }}>{l}</button>
            ))}
          </div>
          {profile.state && profile.state !== 'other' && (
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Indian Govt schemes will always appear regardless of location.
            </p>
          )}
        </div>
        <BoolToggle fieldKey="has_bank_account" label="Has Bank Account?" />
        <BoolToggle fieldKey="is_widow" label="Widow?" />
        <BoolToggle fieldKey="is_disabled" label="Disabled?" />
      </div>

      <button onClick={onSearch} disabled={loading} style={{
        marginTop: 24, width: '100%', padding: '13px',
        background: loading ? 'var(--text-muted)' : 'linear-gradient(135deg, var(--navy), var(--navy-light))',
        color: 'white', border: 'none', borderRadius: 'var(--radius-sm)',
        fontSize: '1rem', fontWeight: 600, letterSpacing: '0.01em',
        transition: 'opacity 0.2s', opacity: loading ? 0.7 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        {loading ? (
          <>
            <div style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            Searching...
          </>
        ) : '🔍 Find Schemes'}
      </button>
    </div>
  )
}

function IssuingBadge({ issuing_body }) {
  const config = {
    delhi:   { bg: 'rgba(232,131,42,0.12)', color: 'var(--saffron)', label: '🏙️ Delhi Govt' },
    central: { bg: 'rgba(15,32,68,0.08)',   color: 'var(--navy)',    label: '🇮🇳 Indian Govt' },
    haryana: { bg: 'rgba(21,128,61,0.10)',  color: '#15803d',        label: '🟢 Haryana Govt' },
  }
  const c = config[issuing_body] || config.central
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600,
      background: c.bg, color: c.color,
      textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>
      {c.label}
    </span>
  )
}

function SchemeCard({ scheme, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: 'white', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
      padding: '20px', cursor: 'pointer', transition: 'all 0.2s',
      animation: 'fadeUp 0.35s ease forwards',
    }}
    onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'var(--saffron)' }}
    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--navy)', lineHeight: 1.3 }}>{scheme.name}</h3>
        <IssuingBadge issuing_body={scheme.issuing_body} />
      </div>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {scheme.description}
      </p>
      <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--saffron)', fontWeight: 600 }}>
        View details →
      </div>
    </div>
  )
}

function SchemeModal({ scheme, onClose }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', handler) }
  }, [onClose])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,32,68,0.6)', backdropFilter: 'blur(4px)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      animation: 'fadeIn 0.2s ease',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'white', borderRadius: 'var(--radius)', maxWidth: 600, width: '100%',
        maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(15,32,68,0.3)', animation: 'fadeUp 0.25s ease',
      }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, var(--navy), var(--navy-light))', padding: '24px 28px', color: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <IssuingBadge issuing_body={scheme.issuing_body} />
              <h2 style={{ marginTop: 10, fontSize: '1.3rem', color: 'white' }}>{scheme.name}</h2>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 32, height: 32, borderRadius: 8, fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 28px', overflowY: 'auto' }}>
          <Section title="About">
            <p style={{ fontSize: '0.93rem', color: 'var(--text)', lineHeight: 1.7 }}>{scheme.description}</p>
          </Section>
          <Section title="Benefits">
            <p style={{ fontSize: '0.93rem', color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{scheme.benefits}</p>
          </Section>
          {scheme.eligibility && scheme.eligibility.length > 0 && (
            <Section title="Eligibility Criteria">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {scheme.eligibility.map((e, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.88rem', color: 'var(--text)' }}>
                    <span style={{ color: 'var(--success)', fontSize: '1rem' }}>✓</span>
                    <span><strong>{e.attribute_label}:</strong> {formatRule(e.attribute_key, e.rule)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h4 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--saffron)', marginBottom: 10 }}>{title}</h4>
      {children}
    </div>
  )
}

function formatRule(key, rule) {
  if (key === 'age' || key === 'annual_income') {
    if (rule.min !== undefined && rule.max !== undefined) return `${rule.min} – ${rule.max}${key === 'annual_income' ? ' ₹/year' : ' years'}`
    if (rule.min !== undefined) return `${rule.min}+ ${key === 'age' ? 'years' : '₹/year'}`
    if (rule.max !== undefined) return `Up to ${rule.max}${key === 'annual_income' ? ' ₹/year' : ' years'}`
  }
  if (key === 'income_category') return `${rule.required} or below`
  if (key === 'gender') return rule.allowed?.join(' or ') || 'Any'
  if (key === 'sector') return rule.allowed?.join(' or ') || 'Any'
  if (typeof rule.required === 'boolean') return rule.required ? 'Required' : 'Must not apply'
  return JSON.stringify(rule)
}

// ─── Main App ─────────────────────────────────────────────────────────────────

const defaultProfile = {
  age: '', gender: '', annual_income: '', income_category: '', sector: '',
  is_widow: null, has_bank_account: null, is_disabled: null, state: '',
}

export default function App() {
  const [profile, setProfile] = useState(defaultProfile)
  const [allSchemes, setAllSchemes] = useState([])
  const [results, setResults] = useState(null) // null = not searched yet
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [filterBody, setFilterBody] = useState('all') // all / central / delhi

  // Load all active schemes with eligibility on mount
  useEffect(() => {
    async function load() {
      const { data: schemes, error: err1 } = await supabase
        .from('schemes')
        .select('*')
        .eq('is_active', true)
        .order('name')

      if (err1) { setError(err1.message); return }

      // Load eligibility for all schemes
      const { data: eligibility, error: err2 } = await supabase
        .from('scheme_eligibility')
        .select('scheme_id, rule, attribute_definitions(key, label)')

      if (err2) { setError(err2.message); return }

      // Attach eligibility to schemes
      const enriched = schemes.map(s => ({
        ...s,
        eligibility: eligibility
          .filter(e => e.scheme_id === s.id)
          .map(e => ({
            attribute_key: e.attribute_definitions.key,
            attribute_label: e.attribute_definitions.label,
            rule: e.rule,
          }))
      }))

      setAllSchemes(enriched)
    }
    load()
  }, [])

  const deriveCategory = (income) => {
    const n = Number(income)
    if (!income || isNaN(n)) return ""
    if (n <= 100000) return "bpl"
    if (n <= 300000) return "low_income"
    return "general"
  }

  const handleChange = (key, val) => {
    if (key === "annual_income") {
      setProfile(p => ({ ...p, annual_income: val, income_category: deriveCategory(val) }))
    } else if (key === "income_category") {
      setProfile(p => ({ ...p, income_category: val, annual_income: "" }))
    } else {
      setProfile(p => ({ ...p, [key]: val }))
    }
  }

  const handleSearch = useCallback(() => {
    setLoading(true)
    setTimeout(() => {
      const matched = allSchemes.filter(s => schemeMatchesProfile(s, profile))
      setResults(matched)
      setLoading(false)
    }, 400)
  }, [allSchemes, profile])

  const displayed = results
    ? (filterBody === 'all' ? results : results.filter(s => s.issuing_body === filterBody))
    : []

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />

      <main style={{ flex: 1, maxWidth: 1100, margin: '0 auto', width: '100%', padding: '32px 20px', display: 'grid', gridTemplateColumns: 'minmax(300px, 360px) 1fr', gap: 28, alignItems: 'start' }}>
        {/* Left: form */}
        <div style={{ position: 'sticky', top: 24 }}>
          <ProfileForm profile={profile} onChange={handleChange} onSearch={handleSearch} loading={loading} />
        </div>

        {/* Right: results */}
        <div>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 'var(--radius-sm)', padding: '14px 18px', color: '#b91c1c', fontSize: '0.9rem' }}>
              ⚠️ {error}
            </div>
          )}

          {results === null && !error && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '3rem', marginBottom: 16 }}>🔍</div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: 8, color: 'var(--navy)' }}>Fill in your details</h3>
              <p style={{ fontSize: '0.9rem' }}>Enter your information on the left and click "Find Schemes" to see all schemes you're eligible for.</p>
            </div>
          )}

          {results !== null && (
            <>
              {/* Filter bar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
                <p style={{ fontWeight: 600, color: 'var(--navy)', fontSize: '0.95rem' }}>
                  {displayed.length} scheme{displayed.length !== 1 ? 's' : ''} found
                  {filterBody !== 'all' && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> (filtered)</span>}
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[['all','All'], ['delhi','🏙️ Delhi'], ['central','🇮🇳 Indian'], ['haryana','🟢 Haryana']].map(([b, label]) => (
                    <button key={b} onClick={() => setFilterBody(b)} style={{
                      padding: '6px 14px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 600,
                      border: '1.5px solid', cursor: 'pointer',
                      borderColor: filterBody === b ? 'var(--navy)' : 'var(--border)',
                      background: filterBody === b ? 'var(--navy)' : 'white',
                      color: filterBody === b ? 'white' : 'var(--text-muted)',
                    }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {displayed.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px', background: 'white', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>😔</div>
                  <h3 style={{ color: 'var(--navy)', marginBottom: 8 }}>No matching schemes</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Try adjusting your filters or leaving some fields blank.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                  {displayed.map((s, i) => (
                    <div key={s.id} style={{ animationDelay: `${i * 0.04}s` }}>
                      <SchemeCard scheme={s} onClick={() => setSelected(s)} />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {selected && <SchemeModal scheme={selected} onClose={() => setSelected(null)} />}

      <footer style={{ background: 'var(--navy)', color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '16px', fontSize: '0.8rem' }}>
        Welfare Scheme Finder · Information sourced from Delhi &amp; Central Government portals
      </footer>
    </div>
  )
}
