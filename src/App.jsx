import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from './supabase.js'

// ─── Income category hierarchy ────────────────────────────────────────────────
const INCOME_HIERARCHY = { bpl: 0, low_income: 1, general: 2 }

function userMeetsRule(userProfile, attribute_key, rule) {
  const val = userProfile[attribute_key]
  if (val === undefined || val === null || val === '') return true

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
      return INCOME_HIERARCHY[val] <= INCOME_HIERARCHY[rule.required]
    }
    case 'gender':
    case 'sector':
    case 'state':
    case 'scheme_type': {
      if (!rule.allowed || rule.allowed.includes('any')) return true
      return rule.allowed.includes(val)
    }
    case 'is_widow':
    case 'has_bank_account':
    case 'is_disabled': {
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

// Returns a list of human-readable reasons why a scheme matches the profile
function getMatchReasons(scheme, userProfile) {
  if (!scheme.eligibility || scheme.eligibility.length === 0) return []
  return scheme.eligibility
    .filter(({ attribute_key }) => {
      const val = userProfile[attribute_key]
      return val !== undefined && val !== null && val !== ''
    })
    .map(({ attribute_label }) => attribute_label)
    .slice(0, 3) // cap at 3 tags so cards don't overflow
}

function formatRule(key, rule) {
  if (key === 'age' || key === 'annual_income') {
    const suffix = key === 'annual_income' ? ' ₹/yr' : ' yrs'
    if (rule.min !== undefined && rule.max !== undefined) return `${rule.min}–${rule.max}${suffix}`
    if (rule.min !== undefined) return `${rule.min}+${suffix}`
    if (rule.max !== undefined) return `Up to ${rule.max}${suffix}`
  }
  if (key === 'income_category') return `${rule.required} or below`
  if (key === 'gender' || key === 'sector') return rule.allowed?.join(' or ') || 'Any'
  if (typeof rule.required === 'boolean') return rule.required ? 'Required' : 'Must not apply'
  return JSON.stringify(rule)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatIncome(val) {
  const n = Number(val)
  if (!val || isNaN(n)) return ''
  return '₹' + n.toLocaleString('en-IN')
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Header({ onReset, hasResults }) {
  return (
    <header style={{
      background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%)',
      color: 'white', padding: '0', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: -60, right: -60, width: 220, height: 220, borderRadius: '50%', background: 'rgba(232,131,42,0.12)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -40, left: '40%', width: 140, height: 140, borderRadius: '50%', background: 'rgba(232,131,42,0.08)', pointerEvents: 'none' }} />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '36px 24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10, flexShrink: 0,
              background: 'linear-gradient(135deg, var(--saffron), var(--saffron-light))',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
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
        {hasResults && (
          <button onClick={onReset} style={{
            padding: '9px 18px', borderRadius: 8, border: '1.5px solid rgba(255,255,255,0.3)',
            background: 'rgba(255,255,255,0.08)', color: 'white', fontSize: '0.85rem',
            fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', backdropFilter: 'blur(4px)',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.18)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
          >
            ↺ Start Over
          </button>
        )}
      </div>
    </header>
  )
}

function BoolToggle({ fieldKey, label, value, onChange }) {
  return (
    <div>
      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        {[{ v: null, l: 'Any' }, { v: true, l: 'Yes' }, { v: false, l: 'No' }].map(({ v, l }) => (
          <button key={String(v)} onClick={() => onChange(fieldKey, v)} style={{
            flex: 1, padding: '10px 4px', borderRadius: 'var(--radius-sm)',
            border: '1.5px solid', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer',
            minHeight: 44,
            borderColor: value === v ? 'var(--saffron)' : 'var(--border)',
            background: value === v ? 'var(--saffron)' : 'white',
            color: value === v ? 'white' : 'var(--text-muted)',
            transition: 'all 0.15s',
          }}>{l}</button>
        ))}
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)',
  borderRadius: 'var(--radius-sm)', background: 'white', fontSize: '0.93rem',
  color: 'var(--text)', outline: 'none', transition: 'border-color 0.2s',
}

function FieldLabel({ children }) {
  return (
    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
      {children}
    </label>
  )
}

function ProfileForm({ profile, onChange, onSearch, onReset, loading, schemesReady }) {
  const handleFocus = e => (e.target.style.borderColor = 'var(--saffron)')
  const handleBlur  = e => (e.target.style.borderColor = 'var(--border)')

  const hasAnyValue = Object.entries(profile).some(([, v]) => v !== '' && v !== null)

  return (
    <div style={{ background: 'white', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '28px 24px', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--navy)' }}>Your Details</h2>
        {hasAnyValue && (
          <button onClick={onReset} style={{
            fontSize: '0.78rem', color: 'var(--text-muted)', background: 'none', border: 'none',
            cursor: 'pointer', textDecoration: 'underline', padding: 0,
          }}>Clear all</button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Age */}
        <div>
          <FieldLabel>Age</FieldLabel>
          <input type="number" placeholder="e.g. 35" value={profile.age || ''} min={0} max={120}
            onChange={e => onChange('age', e.target.value)}
            onFocus={handleFocus} onBlur={handleBlur} style={inputStyle} />
        </div>

        {/* Gender */}
        <div>
          <FieldLabel>Gender</FieldLabel>
          <select value={profile.gender || ''} onChange={e => onChange('gender', e.target.value)}
            onFocus={handleFocus} onBlur={handleBlur} style={inputStyle}>
            <option value="">Any</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="transgender">Transgender</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Annual Income */}
        <div>
          <FieldLabel>Annual Income (₹)</FieldLabel>
          <input type="number" placeholder="e.g. 1,20,000" value={profile.annual_income || ''}
            onChange={e => onChange('annual_income', e.target.value)}
            onFocus={handleFocus} onBlur={handleBlur} style={inputStyle} />
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
            ≤₹1,00,000 = BPL · ₹1L–₹3L = Low Income · &gt;₹3L = General
          </p>
        </div>

        {/* Income Category */}
        <div>
          <FieldLabel>
            Income Category{profile.annual_income && <span style={{ color: 'var(--saffron)', fontSize: '0.7rem', fontWeight: 500, marginLeft: 4 }}>(auto-set)</span>}
          </FieldLabel>
          <select value={profile.income_category || ''} onChange={e => onChange('income_category', e.target.value)}
            onFocus={handleFocus} onBlur={handleBlur}
            style={{ ...inputStyle, background: profile.annual_income ? '#fffbf5' : 'white', borderColor: profile.annual_income ? 'var(--saffron)' : 'var(--border)' }}>
            <option value="">Any</option>
            <option value="bpl">BPL (Below Poverty Line)</option>
            <option value="low_income">Low Income</option>
            <option value="general">General</option>
          </select>
          {profile.annual_income && (
            <p style={{ fontSize: '0.72rem', color: 'var(--saffron)', marginTop: 4 }}>
              Auto-derived from ₹{Number(profile.annual_income).toLocaleString('en-IN')}. Override manually to clear income.
            </p>
          )}
        </div>

        {/* Sector */}
        <div style={{ gridColumn: '1 / -1' }}>
          <FieldLabel>Employment Sector</FieldLabel>
          <select value={profile.sector || ''} onChange={e => onChange('sector', e.target.value)}
            onFocus={handleFocus} onBlur={handleBlur} style={inputStyle}>
            <option value="">Any</option>
            <option value="unorganised">Unorganised Sector</option>
            <option value="organised">Organised Sector</option>
          </select>
        </div>
      </div>

      {/* State */}
      <div style={{ marginTop: 16 }}>
        <FieldLabel>State / Location</FieldLabel>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[['', 'Not Specified'], ['delhi', '🏙️ Delhi'], ['haryana', '🟢 Haryana'], ['other', '🗺️ Other State']].map(([v, l]) => (
            <button key={v} onClick={() => onChange('state', v)} style={{
              flex: 1, minWidth: 80, padding: '10px 4px', borderRadius: 'var(--radius-sm)',
              border: '1.5px solid', fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer', minHeight: 44,
              borderColor: profile.state === v ? 'var(--saffron)' : 'var(--border)',
              background: profile.state === v ? 'var(--saffron)' : 'white',
              color: profile.state === v ? 'white' : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}>{l}</button>
          ))}
        </div>
        {profile.state === 'other' ? (
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Only Central Government schemes will appear for other states.
          </p>
        ) : profile.state ? (
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Central Govt schemes will always appear regardless of location.
          </p>
        ) : null}
      </div>

      {/* Boolean toggles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 16 }}>
        <BoolToggle fieldKey="has_bank_account" label="Has Bank Account?" value={profile.has_bank_account} onChange={onChange} />
        <BoolToggle fieldKey="is_widow" label="Widowed?" value={profile.is_widow} onChange={onChange} />
        <BoolToggle fieldKey="is_disabled" label="Person with Disability?" value={profile.is_disabled} onChange={onChange} />
      </div>

      {/* Scheme Type */}
      <div style={{ marginTop: 16 }}>
        <FieldLabel>Scheme Type</FieldLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[['', 'Any'], ['dbt', 'DBT'], ['insurance', 'Insurance'], ['subsidy', 'Subsidy'], ['kind', 'Kind'], ['livelihood', 'Livelihood']].map(([v, l]) => (
            <button key={v} onClick={() => onChange('scheme_type', v)} style={{
              padding: '8px 14px', borderRadius: 20, border: '1.5px solid', fontSize: '0.82rem',
              fontWeight: 500, cursor: 'pointer', minHeight: 36,
              borderColor: profile.scheme_type === v ? 'var(--saffron)' : 'var(--border)',
              background: profile.scheme_type === v ? 'var(--saffron)' : 'white',
              color: profile.scheme_type === v ? 'white' : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}>{l}</button>
          ))}
        </div>
      </div>

      <button
        onClick={onSearch}
        disabled={loading || !schemesReady}
        title={!schemesReady ? 'Loading schemes, please wait...' : ''}
        style={{
          marginTop: 24, width: '100%', padding: '13px',
          background: (loading || !schemesReady) ? 'var(--text-muted)' : 'linear-gradient(135deg, var(--navy), var(--navy-light))',
          color: 'white', border: 'none', borderRadius: 'var(--radius-sm)',
          fontSize: '1rem', fontWeight: 600, cursor: (loading || !schemesReady) ? 'not-allowed' : 'pointer',
          transition: 'opacity 0.2s', opacity: (loading || !schemesReady) ? 0.7 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
        {loading ? (
          <>
            <div style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            Searching...
          </>
        ) : !schemesReady ? 'Loading schemes...' : '🔍 Find Schemes'}
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
      background: c.bg, color: c.color, textTransform: 'uppercase', letterSpacing: '0.05em',
      whiteSpace: 'nowrap',
    }}>{c.label}</span>
  )
}

function SchemeCard({ scheme, onClick, matchReasons }) {
  return (
    <div onClick={onClick}
      className="scheme-card"
      style={{
        background: 'white', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
        padding: '20px', cursor: 'pointer', transition: 'all 0.2s',
        animation: 'fadeUp 0.35s ease forwards',
        display: 'flex', flexDirection: 'column',
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

      <div style={{ marginTop: 'auto', paddingTop: 12 }}>
        {/* Match reasons — only shown when user has filled profile fields */}
        {matchReasons.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {matchReasons.map(r => (
              <span key={r} style={{
                padding: '2px 8px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 600,
                background: 'rgba(21,128,61,0.08)', color: 'var(--success)',
                border: '1px solid rgba(21,128,61,0.2)',
              }}>✓ {r}</span>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {scheme.scheme_type && (
            <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, background: '#f1f5f9', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              {scheme.scheme_type}
            </span>
          )}
          <div style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--saffron)', fontWeight: 600 }}>
            View details →
          </div>
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

function SchemeModal({ scheme, onClose }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', handler) }
  }, [onClose])

  // Build apply URL — use scheme.apply_url if available, otherwise fall back to a search
  const applyUrl = scheme.apply_url ||
    `https://www.india.gov.in/search/site/${encodeURIComponent(scheme.name)}`

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
        {/* Modal header */}
        <div style={{ background: 'linear-gradient(135deg, var(--navy), var(--navy-light))', padding: '24px 28px', color: 'white', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <IssuingBadge issuing_body={scheme.issuing_body} />
              <h2 style={{ marginTop: 10, fontSize: '1.3rem', color: 'white' }}>{scheme.name}</h2>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 32, height: 32, borderRadius: 8, fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        {/* Modal body */}
        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>
          <Section title="About">
            <p style={{ fontSize: '0.93rem', color: 'var(--text)', lineHeight: 1.7 }}>{scheme.description}</p>
          </Section>
          <Section title="Benefits">
            <p style={{ fontSize: '0.93rem', color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{scheme.benefits}</p>
          </Section>
          {scheme.documents_required && (
            <Section title="Documents Required">
              <p style={{ fontSize: '0.93rem', color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{scheme.documents_required}</p>
            </Section>
          )}
          {scheme.eligibility?.length > 0 && (
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

        {/* ── Apply CTA — the most important thing ── */}
        <div style={{
          padding: '16px 28px', borderTop: '1px solid var(--border)', flexShrink: 0,
          display: 'flex', gap: 12, alignItems: 'center', background: 'var(--cream)',
        }}>
          <a
            href={applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1, padding: '12px', borderRadius: 'var(--radius-sm)', textDecoration: 'none',
              background: 'linear-gradient(135deg, var(--saffron), var(--saffron-light))',
              color: 'white', fontWeight: 700, fontSize: '0.95rem', textAlign: 'center',
              display: 'block', transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            Apply Now →
          </a>
          {scheme.apply_url && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: 160, lineHeight: 1.4 }}>
              Opens the official government portal
            </span>
          )}
          {!scheme.apply_url && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: 160, lineHeight: 1.4 }}>
              Will search the official India.gov.in portal
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────

const defaultProfile = {
  age: '', gender: '', annual_income: '', income_category: '', sector: '',
  is_widow: null, has_bank_account: null, is_disabled: null, state: '', scheme_type: '',
}

export default function App() {
  const [profile, setProfile] = useState(defaultProfile)
  const [allSchemes, setAllSchemes] = useState([])
  const [schemesReady, setSchemesReady] = useState(false)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [filterBody, setFilterBody] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    async function load() {
      const { data: schemes, error: err1 } = await supabase
        .from('schemes')
        .select('*, scheme_eligibility(rule, attribute_definitions(key, label))')
        .eq('is_active', true)
        .order('name')

      if (err1) { setError(err1.message); return }

      const enriched = schemes.map(s => ({
        ...s,
        eligibility: (s.scheme_eligibility || []).map(e => ({
          attribute_key: e.attribute_definitions?.key,
          attribute_label: e.attribute_definitions?.label,
          rule: e.rule,
        })).filter(e => e.attribute_key),
      }))

      setAllSchemes(enriched)
      setSchemesReady(true)
    }
    load()
  }, [])

  const deriveCategory = (income) => {
    const n = Number(income)
    if (!income || isNaN(n)) return ''
    if (n <= 100000) return 'bpl'
    if (n <= 300000) return 'low_income'
    return 'general'
  }

  const handleChange = useCallback((key, val) => {
    if (key === 'annual_income') {
      setProfile(p => ({ ...p, annual_income: val, income_category: deriveCategory(val) }))
    } else if (key === 'income_category') {
      setProfile(p => ({ ...p, income_category: val, annual_income: '' }))
    } else {
      setProfile(p => ({ ...p, [key]: val }))
    }
  }, [])

  const handleReset = useCallback(() => {
    setProfile(defaultProfile)
    setResults(null)
    setFilterBody('all')
    setSearchQuery('')
    setError(null)
  }, [])

  const handleSearch = useCallback(() => {
    setLoading(true)
    // Use setTimeout to allow the loading state to actually render before sync work
    setTimeout(() => {
      const matched = allSchemes.filter(s => schemeMatchesProfile(s, profile))
      setResults(matched)
      setFilterBody('all')
      setSearchQuery('')
      setLoading(false)
    }, 0)
  }, [allSchemes, profile])

  // Dynamically derive available issuing bodies from results
  const issuingBodies = useMemo(() => {
    if (!results) return []
    const bodies = [...new Set(results.map(s => s.issuing_body).filter(Boolean))]
    return bodies
  }, [results])

  const bodyLabels = {
    delhi: '🏙️ Delhi',
    central: '🇮🇳 Central',
    haryana: '🟢 Haryana',
  }

  const displayed = useMemo(() => {
    if (!results) return []
    let filtered = filterBody === 'all' ? results : results.filter(s => s.issuing_body === filterBody)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(s =>
        s.name?.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q)
      )
    }
    return filtered
  }, [results, filterBody, searchQuery])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header onReset={handleReset} hasResults={results !== null} />

      <main style={{
        flex: 1, maxWidth: 1100, margin: '0 auto', width: '100%', padding: '32px 20px',
        display: 'grid', gridTemplateColumns: 'minmax(300px, 360px) 1fr', gap: 28, alignItems: 'start',
      }}>
        {/* Left: form */}
        <div style={{ position: 'sticky', top: 24 }}>
          <ProfileForm
            profile={profile}
            onChange={handleChange}
            onSearch={handleSearch}
            onReset={handleReset}
            loading={loading}
            schemesReady={schemesReady}
          />
        </div>

        {/* Right: results */}
        <div>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 'var(--radius-sm)', padding: '14px 18px', color: '#b91c1c', fontSize: '0.9rem', marginBottom: 16 }}>
              ⚠️ {error}
              <button onClick={() => window.location.reload()} style={{ marginLeft: 12, fontSize: '0.85rem', color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                Retry
              </button>
            </div>
          )}

          {results === null && !error && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '3rem', marginBottom: 16 }}>🔍</div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: 8, color: 'var(--navy)' }}>Fill in your details</h3>
              <p style={{ fontSize: '0.9rem' }}>Enter your information on the left and click "Find Schemes" to see schemes you're eligible for.</p>
            </div>
          )}

          {results !== null && (
            <>
              {/* Filter bar */}
              <div style={{ marginBottom: 16 }}>
                {/* Top row: count + issuing body filters */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                  <p style={{ fontWeight: 600, color: 'var(--navy)', fontSize: '0.95rem' }}>
                    {displayed.length} scheme{displayed.length !== 1 ? 's' : ''} found
                    {(filterBody !== 'all' || searchQuery) && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> (filtered)</span>}
                  </p>
                  {results.length > 0 && issuingBodies.length > 1 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button key="all" onClick={() => setFilterBody('all')} style={{
                        padding: '6px 14px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 600,
                        border: '1.5px solid', cursor: 'pointer',
                        borderColor: filterBody === 'all' ? 'var(--navy)' : 'var(--border)',
                        background: filterBody === 'all' ? 'var(--navy)' : 'white',
                        color: filterBody === 'all' ? 'white' : 'var(--text-muted)',
                      }}>All</button>
                      {issuingBodies.map(b => (
                        <button key={b} onClick={() => setFilterBody(b)} style={{
                          padding: '6px 14px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 600,
                          border: '1.5px solid', cursor: 'pointer',
                          borderColor: filterBody === b ? 'var(--navy)' : 'var(--border)',
                          background: filterBody === b ? 'var(--navy)' : 'white',
                          color: filterBody === b ? 'white' : 'var(--text-muted)',
                        }}>{bodyLabels[b] || b}</button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Search within results */}
                {results.length > 4 && (
                  <input
                    type="text"
                    placeholder="Search within results..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{
                      ...inputStyle,
                      paddingLeft: 16,
                      background: 'white',
                      boxShadow: 'var(--shadow)',
                    }}
                  />
                )}
              </div>

              {displayed.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px', background: 'white', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>😔</div>
                  <h3 style={{ color: 'var(--navy)', marginBottom: 8 }}>
                    {results.length === 0 ? 'No matching schemes' : 'No schemes match your search'}
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    {results.length === 0
                      ? 'Try adjusting your filters or leaving some fields blank.'
                      : 'Try a different keyword or clear the search.'}
                  </p>
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} style={{ marginTop: 12, fontSize: '0.85rem', color: 'var(--saffron)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}>
                      Clear search
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                  {displayed.map(s => (
                    <SchemeCard
                      key={s.id}
                      scheme={s}
                      onClick={() => setSelected(s)}
                      matchReasons={getMatchReasons(s, profile)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {selected && <SchemeModal scheme={selected} onClose={() => setSelected(null)} />}

      <footer style={{ background: 'var(--navy)', color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '16px', fontSize: '0.8rem' }}>
        Welfare Scheme Finder · Information sourced from{' '}
        <a href="https://www.delhi.gov.in" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'underline' }}>Delhi Government</a>
        {' '}and{' '}
        <a href="https://www.india.gov.in" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'underline' }}>Central Government</a>
        {' '}portals
      </footer>
    </div>
  )
}
