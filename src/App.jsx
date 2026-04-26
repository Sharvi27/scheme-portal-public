import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from './supabase.js'
import { loadSchemes } from './db.js'
import { syncFromSupabase } from './sync.js'

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
    case 'scheme_type': {
      if (!rule.allowed || rule.allowed.includes('any')) return true
      return rule.allowed.includes(val)
    }
    case 'state': {
      if (!rule.allowed || rule.allowed.includes('any')) return true
      // If user selected 'other', only central schemes (no state rule) should show
      if (val === 'other') return false
      return rule.allowed.includes(val)
    }
    case 'is_widow':
    case 'has_bank_account':
    case 'is_disabled':
    case 'is_farmer':
    case 'is_student':
    case 'is_pregnant':
    case 'is_senior':
    case 'is_street_vendor':
    case 'is_artisan':
    case 'is_construction_worker':
    case 'is_minority':
    case 'is_unemployed':
    case 'is_girl_child': {
      if (rule.required === true && val !== true) return false
      if (rule.required === false && val !== false) return false
      return true
    }
    case 'caste_category': {
      if (!rule.allowed || rule.allowed.includes('any')) return true
      return rule.allowed.includes(val)
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

function getMatchReasons(scheme, userProfile) {
  if (!scheme.eligibility || scheme.eligibility.length === 0) return []
  return scheme.eligibility
    .filter(({ attribute_key }) => {
      const val = userProfile[attribute_key]
      return val !== undefined && val !== null && val !== ''
    })
    .map(({ attribute_label }) => attribute_label)
    .slice(0, 3)
}

function formatRule(key, rule) {
  if (key === 'age' || key === 'annual_income') {
    const suffix = key === 'annual_income' ? ' ₹/yr' : ' yrs'
    if (rule.min !== undefined && rule.max !== undefined) return `${rule.min}–${rule.max}${suffix}`
    if (rule.min !== undefined) return `${rule.min}+${suffix}`
    if (rule.max !== undefined) return `Up to ${rule.max}${suffix}`
  }
  if (key === 'income_category') return `${rule.required} or below`
  if (key === 'gender' || key === 'sector' || key === 'state' || key === 'caste_category') return rule.allowed?.join(' or ') || 'Any'
  if (typeof rule.required === 'boolean') return rule.required ? 'Required' : 'Must not apply'
  return JSON.stringify(rule)
}

// ─── All states config ────────────────────────────────────────────────────────
const STATE_OPTIONS = [
  { value: '',            label: 'Not Specified' },
  { value: 'delhi',       label: '🏙️ Delhi' },
  { value: 'haryana',     label: '🟢 Haryana' },
  { value: 'karnataka',   label: '🟠 Karnataka' },
  { value: 'maharashtra', label: '🟣 Maharashtra' },
  { value: 'tamil_nadu',  label: '🔵 Tamil Nadu' },
  { value: 'telangana',   label: '🟡 Telangana' },
  { value: 'other',       label: '🗺️ Other State' },
]

const ISSUING_BODY_CONFIG = {
  central:     { bg: 'rgba(15,32,68,0.08)',    color: 'var(--navy)',    label: '🇮🇳 Central Govt' },
  delhi:       { bg: 'rgba(232,131,42,0.12)',  color: 'var(--saffron)', label: '🏙️ Delhi Govt' },
  haryana:     { bg: 'rgba(21,128,61,0.10)',   color: '#15803d',        label: '🟢 Haryana Govt' },
  karnataka:   { bg: 'rgba(234,88,12,0.10)',   color: '#ea580c',        label: '🟠 Karnataka Govt' },
  maharashtra: { bg: 'rgba(109,40,217,0.09)',  color: '#7c3aed',        label: '🟣 Maharashtra Govt' },
  tamil_nadu:  { bg: 'rgba(37,99,235,0.09)',   color: '#2563eb',        label: '🔵 Tamil Nadu Govt' },
  telangana:   { bg: 'rgba(202,138,4,0.10)',   color: '#b45309',        label: '🟡 Telangana Govt' },
}

const BODY_FILTER_LABELS = {
  all:         'All',
  central:     '🇮🇳 Central',
  delhi:       '🏙️ Delhi',
  haryana:     '🟢 Haryana',
  karnataka:   '🟠 Karnataka',
  maharashtra: '🟣 Maharashtra',
  tamil_nadu:  '🔵 Tamil Nadu',
  telangana:   '🟡 Telangana',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)',
  borderRadius: 'var(--radius-sm)', background: 'white', fontSize: '0.93rem',
  color: 'var(--text)', outline: 'none', transition: 'border-color 0.2s',
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
                Central &amp; State Government Schemes · 7 States · 76+ Schemes
              </p>
            </div>
          </div>
          <p style={{ fontSize: '0.95rem', opacity: 0.85, maxWidth: 560, marginTop: 12, fontWeight: 300 }}>
            Enter your details to find all government schemes you may be eligible for.
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

function FieldLabel({ children }) {
  return (
    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--navy)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
      {children}
    </label>
  )
}

function BoolToggle({ fieldKey, label, value, onChange }) {
  return (
    <div>
      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--navy)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        {[{ v: null, l: '—' }, { v: true, l: 'Yes' }, { v: false, l: 'No' }].map(({ v, l }) => (
          <button key={String(v)} onClick={() => onChange(fieldKey, v)} style={{
            flex: 1, padding: '9px 4px', borderRadius: 'var(--radius-sm)',
            border: '1.5px solid', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
            minHeight: 40,
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

// Collapsible section for profile form
function FormSection({ title, icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginBottom: open ? 12 : 0,
        }}
      >
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--navy)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
          {icon} {title}
        </span>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </button>
      {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>}
    </div>
  )
}

function ProfileForm({ profile, onChange, onSearch, onReset, loading, schemesReady }) {
  const handleFocus = e => (e.target.style.borderColor = 'var(--saffron)')
  const handleBlur  = e => (e.target.style.borderColor = 'var(--border)')

  const hasAnyValue = Object.entries(profile).some(([, v]) => v !== '' && v !== null)
  const filledCount = Object.entries(profile).filter(([, v]) => v !== '' && v !== null).length

  return (
    <div style={{ background: 'white', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '24px 22px', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--navy)' }}>Your Details</h2>
        {hasAnyValue && (
          <button onClick={onReset} style={{
            fontSize: '0.75rem', color: 'var(--text-muted)', background: 'none', border: 'none',
            cursor: 'pointer', textDecoration: 'underline', padding: 0,
          }}>Clear all</button>
        )}
      </div>
      {filledCount > 0 && (
        <p style={{ fontSize: '0.75rem', color: 'var(--saffron)', marginBottom: 12, fontWeight: 500 }}>
          {filledCount} field{filledCount !== 1 ? 's' : ''} filled — more details = better matches
        </p>
      )}

      {/* ── Basic Info ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <FieldLabel>Age</FieldLabel>
          <input type="number" placeholder="e.g. 35" value={profile.age || ''} min={0} max={120}
            onChange={e => onChange('age', e.target.value)}
            onFocus={handleFocus} onBlur={handleBlur} style={inputStyle} />
        </div>

        <div>
          <FieldLabel>Gender</FieldLabel>
          <select value={profile.gender || ''} onChange={e => onChange('gender', e.target.value)}
            onFocus={handleFocus} onBlur={handleBlur} style={inputStyle}>
            <option value="">Any</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="transgender">Transgender</option>
          </select>
        </div>

        <div>
          <FieldLabel>Annual Income (₹)</FieldLabel>
          <input type="number" placeholder="e.g. 1,20,000" value={profile.annual_income || ''}
            onChange={e => onChange('annual_income', e.target.value)}
            onFocus={handleFocus} onBlur={handleBlur} style={inputStyle} />
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>
            ≤₹1L = BPL · ₹1L–₹3L = Low Income
          </p>
        </div>

        <div>
          <FieldLabel>
            Income Category
            {profile.annual_income && <span style={{ color: 'var(--saffron)', fontSize: '0.68rem', fontWeight: 500, marginLeft: 4 }}>(auto)</span>}
          </FieldLabel>
          <select value={profile.income_category || ''} onChange={e => onChange('income_category', e.target.value)}
            onFocus={handleFocus} onBlur={handleBlur}
            style={{ ...inputStyle, background: profile.annual_income ? '#fffbf5' : 'white', borderColor: profile.annual_income ? 'var(--saffron)' : 'var(--border)' }}>
            <option value="">Any</option>
            <option value="bpl">BPL</option>
            <option value="low_income">Low Income</option>
            <option value="general">General</option>
          </select>
        </div>
      </div>

      {/* ── State ── */}
      <div style={{ marginTop: 16 }}>
        <FieldLabel>State / Location</FieldLabel>
        <select
          value={profile.state || ''}
          onChange={e => onChange('state', e.target.value)}
          onFocus={handleFocus} onBlur={handleBlur}
          style={{ ...inputStyle, fontSize: '0.9rem' }}
        >
          {STATE_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
          {profile.state === 'other'
            ? 'Only Central Government schemes will appear.'
            : profile.state
            ? 'Central Govt + your state schemes will appear.'
            : 'Select a state to see state-specific schemes.'}
        </p>
      </div>

      {/* ── Employment & Sector ── */}
      <FormSection title="Employment" icon="💼" defaultOpen={true}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <FieldLabel>Sector</FieldLabel>
            <select value={profile.sector || ''} onChange={e => onChange('sector', e.target.value)}
              onFocus={handleFocus} onBlur={handleBlur} style={inputStyle}>
              <option value="">Any</option>
              <option value="unorganised">Unorganised</option>
              <option value="organised">Organised</option>
              <option value="informal">Informal</option>
            </select>
          </div>
          <div>
            <FieldLabel>Caste Category</FieldLabel>
            <select value={profile.caste_category || ''} onChange={e => onChange('caste_category', e.target.value)}
              onFocus={handleFocus} onBlur={handleBlur} style={inputStyle}>
              <option value="">Not specified</option>
              <option value="SC">SC (Scheduled Caste)</option>
              <option value="ST">ST (Scheduled Tribe)</option>
              <option value="OBC">OBC</option>
              <option value="General">General</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <BoolToggle fieldKey="is_farmer"     label="Farmer?"         value={profile.is_farmer}     onChange={onChange} />
          <BoolToggle fieldKey="is_unemployed" label="Unemployed?"     value={profile.is_unemployed} onChange={onChange} />
          <BoolToggle fieldKey="is_artisan"    label="Artisan/Craft?"  value={profile.is_artisan}    onChange={onChange} />
          <BoolToggle fieldKey="is_street_vendor" label="Street Vendor?" value={profile.is_street_vendor} onChange={onChange} />
          <BoolToggle fieldKey="is_construction_worker" label="Construction Worker?" value={profile.is_construction_worker} onChange={onChange} />
          <BoolToggle fieldKey="is_student"    label="Student?"        value={profile.is_student}    onChange={onChange} />
        </div>
      </FormSection>

      {/* ── Personal Circumstances ── */}
      <FormSection title="Personal Circumstances" icon="👤" defaultOpen={true}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <BoolToggle fieldKey="has_bank_account" label="Has Bank Account?" value={profile.has_bank_account} onChange={onChange} />
          <BoolToggle fieldKey="is_widow"         label="Widowed?"           value={profile.is_widow}         onChange={onChange} />
          <BoolToggle fieldKey="is_disabled"      label="Person w/ Disability?" value={profile.is_disabled}  onChange={onChange} />
          <BoolToggle fieldKey="is_pregnant"      label="Pregnant / Lactating?" value={profile.is_pregnant}  onChange={onChange} />
          <BoolToggle fieldKey="is_senior"        label="Senior Citizen (60+)?" value={profile.is_senior}    onChange={onChange} />
          <BoolToggle fieldKey="is_minority"      label="Minority Community?" value={profile.is_minority}    onChange={onChange} />
          <BoolToggle fieldKey="is_girl_child"    label="Girl Child (≤10 yrs)?" value={profile.is_girl_child} onChange={onChange} />
        </div>
      </FormSection>

      {/* ── Scheme Type ── */}
      <FormSection title="Scheme Type" icon="📋" defaultOpen={false}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {[['', 'Any'], ['DBT', 'DBT (Cash Transfer)'], ['Non-DBT', 'Non-DBT (Services/Kind)']].map(([v, l]) => (
            <button key={v} onClick={() => onChange('scheme_type', v)} style={{
              padding: '7px 13px', borderRadius: 20, border: '1.5px solid', fontSize: '0.8rem',
              fontWeight: 500, cursor: 'pointer',
              borderColor: profile.scheme_type === v ? 'var(--saffron)' : 'var(--border)',
              background: profile.scheme_type === v ? 'var(--saffron)' : 'white',
              color: profile.scheme_type === v ? 'white' : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}>{l}</button>
          ))}
        </div>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          DBT = money directly to bank account. Non-DBT = free services, goods, or in-kind benefits.
        </p>
      </FormSection>

      <button
        onClick={onSearch}
        disabled={loading || !schemesReady}
        title={!schemesReady ? 'Loading schemes, please wait...' : ''}
        style={{
          marginTop: 22, width: '100%', padding: '13px',
          background: (loading || !schemesReady) ? 'var(--text-muted)' : 'linear-gradient(135deg, var(--navy), var(--navy-light))',
          color: 'white', border: 'none', borderRadius: 'var(--radius-sm)',
          fontSize: '1rem', fontWeight: 700, cursor: (loading || !schemesReady) ? 'not-allowed' : 'pointer',
          transition: 'opacity 0.2s', opacity: (loading || !schemesReady) ? 0.7 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          letterSpacing: '0.02em',
        }}>
        {loading ? (
          <>
            <div style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            Searching…
          </>
        ) : !schemesReady ? 'Loading schemes…' : '🔍 Find Schemes'}
      </button>
    </div>
  )
}

function IssuingBadge({ issuing_body }) {
  const c = ISSUING_BODY_CONFIG[issuing_body] || ISSUING_BODY_CONFIG.central
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600,
      background: c.bg, color: c.color, textTransform: 'uppercase', letterSpacing: '0.05em',
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>{c.label}</span>
  )
}

function SchemeCard({ scheme, onClick, matchReasons }) {
  return (
    <div onClick={onClick}
      style={{
        background: 'white', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
        padding: '18px 20px', cursor: 'pointer', transition: 'all 0.2s',
        animation: 'fadeUp 0.35s ease forwards',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.borderColor = 'var(--saffron)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.transform = 'none'
        e.currentTarget.style.borderColor = 'var(--border)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <h3 style={{ fontSize: '0.97rem', fontWeight: 700, color: 'var(--navy)', lineHeight: 1.3 }}>{scheme.name}</h3>
        <IssuingBadge issuing_body={scheme.issuing_body} />
      </div>

      <p style={{ fontSize: '0.855rem', color: 'var(--text-muted)', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {scheme.description}
      </p>



      <div style={{ marginTop: 'auto', paddingTop: 4 }}>
        {matchReasons.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {matchReasons.map(r => (
              <span key={r} style={{
                padding: '2px 8px', borderRadius: 20, fontSize: '0.67rem', fontWeight: 600,
                background: 'rgba(21,128,61,0.08)', color: 'var(--success)',
                border: '1px solid rgba(21,128,61,0.2)',
              }}>✓ {r}</span>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {scheme.scheme_type && (
            <span style={{
              padding: '2px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600,
              background: scheme.scheme_type === 'DBT' ? 'rgba(15,32,68,0.07)' : '#f1f5f9',
              color: scheme.scheme_type === 'DBT' ? 'var(--navy)' : 'var(--text-muted)',
              textTransform: 'uppercase',
            }}>
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
    <div style={{ marginBottom: 22 }}>
      <h4 style={{ fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--saffron)', marginBottom: 10 }}>{title}</h4>
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

  const applyUrl = scheme.apply_url ||
    `https://www.india.gov.in/search/site/${encodeURIComponent(scheme.name)}`

  const bodyConf = ISSUING_BODY_CONFIG[scheme.issuing_body] || ISSUING_BODY_CONFIG.central

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,32,68,0.6)', backdropFilter: 'blur(4px)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      animation: 'fadeIn 0.2s ease',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'white', borderRadius: 'var(--radius)', maxWidth: 620, width: '100%',
        maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(15,32,68,0.3)', animation: 'fadeUp 0.25s ease',
      }}>
        {/* Modal header */}
        <div style={{ background: 'linear-gradient(135deg, var(--navy), var(--navy-light))', padding: '22px 26px', color: 'white', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, paddingRight: 12 }}>
              <IssuingBadge issuing_body={scheme.issuing_body} />
              <h2 style={{ marginTop: 10, fontSize: '1.25rem', color: 'white', lineHeight: 1.3 }}>{scheme.name}</h2>
              {scheme.scheme_type && (
                <span style={{ marginTop: 6, display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600, background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)' }}>
                  {scheme.scheme_type === 'DBT' ? '💳 DBT — Cash Transfer' : '🎁 Non-DBT — Services / In-Kind'}
                </span>
              )}
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 32, height: 32, borderRadius: 8, fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        {/* Modal body */}
        <div style={{ padding: '22px 26px', overflowY: 'auto', flex: 1 }}>
          <Section title="About this Scheme">
            <p style={{ fontSize: '0.92rem', color: 'var(--text)', lineHeight: 1.75 }}>{scheme.description}</p>
          </Section>

          <Section title="Benefits">
            <p style={{ fontSize: '0.92rem', color: 'var(--text)', lineHeight: 1.75, whiteSpace: 'pre-line' }}>{scheme.benefits}</p>
          </Section>



          {(scheme.documents || scheme.documents_required) && (
            <Section title="Documents Required">
              <p style={{ fontSize: '0.92rem', color: 'var(--text)', lineHeight: 1.75, whiteSpace: 'pre-line' }}>
                {scheme.documents || scheme.documents_required}
              </p>
            </Section>
          )}

          {scheme.eligibility?.length > 0 && (
            <Section title="Eligibility Criteria">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {scheme.eligibility.map((e, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.88rem', color: 'var(--text)', background: '#f8fafc', borderRadius: 6, padding: '8px 12px' }}>
                    <span style={{ color: 'var(--success)', fontSize: '1rem', flexShrink: 0 }}>✓</span>
                    <span><strong>{e.attribute_label}:</strong> {formatRule(e.attribute_key, e.rule)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* Apply CTA */}
        <div style={{
          padding: '14px 26px', borderTop: '1px solid var(--border)', flexShrink: 0,
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
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', maxWidth: 150, lineHeight: 1.4 }}>
            {scheme.apply_url ? 'Opens the official government portal' : 'Searches the India.gov.in portal'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Stats bar ────────────────────────────────────────────────────────────────
function StatsBar({ results, displayed, filterBody, setFilterBody, issuingBodies, searchQuery, setSearchQuery }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <p style={{ fontWeight: 700, color: 'var(--navy)', fontSize: '0.95rem' }}>
          {displayed.length} scheme{displayed.length !== 1 ? 's' : ''} found
          {(filterBody !== 'all' || searchQuery) && (
            <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> (filtered from {results.length})</span>
          )}
        </p>

        {results.length > 0 && issuingBodies.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => setFilterBody('all')} style={{
              padding: '5px 12px', borderRadius: 20, fontSize: '0.77rem', fontWeight: 600,
              border: '1.5px solid', cursor: 'pointer',
              borderColor: filterBody === 'all' ? 'var(--navy)' : 'var(--border)',
              background: filterBody === 'all' ? 'var(--navy)' : 'white',
              color: filterBody === 'all' ? 'white' : 'var(--text-muted)',
            }}>All ({results.length})</button>
            {issuingBodies.map(b => {
              const count = results.filter(s => s.issuing_body === b).length
              return (
                <button key={b} onClick={() => setFilterBody(b)} style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: '0.77rem', fontWeight: 600,
                  border: '1.5px solid', cursor: 'pointer',
                  borderColor: filterBody === b ? 'var(--navy)' : 'var(--border)',
                  background: filterBody === b ? 'var(--navy)' : 'white',
                  color: filterBody === b ? 'white' : 'var(--text-muted)',
                }}>{BODY_FILTER_LABELS[b] || b} ({count})</button>
              )
            })}
          </div>
        )}
      </div>

      {results.length > 4 && (
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Search within results…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              ...inputStyle,
              paddingLeft: 36,
              background: 'white',
              boxShadow: 'var(--shadow)',
            }}
          />
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '0.85rem', pointerEvents: 'none' }}>🔍</span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1 }}
            >×</button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────

const defaultProfile = {
  age: '',
  gender: '',
  annual_income: '',
  income_category: '',
  sector: '',
  caste_category: '',
  state: '',
  scheme_type: '',
  // booleans — null = not specified
  has_bank_account: null,
  is_widow: null,
  is_disabled: null,
  is_farmer: null,
  is_student: null,
  is_pregnant: null,
  is_senior: null,
  is_street_vendor: null,
  is_artisan: null,
  is_construction_worker: null,
  is_minority: null,
  is_unemployed: null,
  is_girl_child: null,
}

export default function App() {
  const [profile, setProfile]         = useState(defaultProfile)
  const [allSchemes, setAllSchemes]   = useState([])
  const [schemesReady, setSchemesReady] = useState(false)
  const [results, setResults]         = useState(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)
  const [selected, setSelected]       = useState(null)
  const [filterBody, setFilterBody]   = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [syncStatus, setSyncStatus]   = useState(null)

  useEffect(() => {
    async function init() {
      try {
        const local = await loadSchemes()
        if (local.length > 0) {
          setAllSchemes(local)
          setSchemesReady(true)
        }
      } catch (_) {}

      if (navigator.onLine) {
        setSyncStatus('syncing')
        const result = await syncFromSupabase()
        if (result.status === 'updated') {
          const fresh = await loadSchemes()
          setAllSchemes(fresh)
          setSyncStatus('updated')
          setTimeout(() => setSyncStatus(null), 3000)
        } else if (result.status === 'error') {
          setError(result.message)
          setSyncStatus(null)
        } else {
          setSyncStatus(null)
        }
      } else {
        setSyncStatus('offline')
      }
      setSchemesReady(true)
    }
    init()

    const handleOnline = async () => {
      setSyncStatus('syncing')
      const result = await syncFromSupabase({ force: true })
      if (result.status === 'updated') {
        const fresh = await loadSchemes()
        setAllSchemes(fresh)
        setSyncStatus('updated')
        setTimeout(() => setSyncStatus(null), 3000)
      } else {
        setSyncStatus(null)
      }
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
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
    } else if (key === 'age') {
      // Auto-set is_senior
      const n = Number(val)
      setProfile(p => ({ ...p, age: val, is_senior: val && !isNaN(n) ? n >= 60 : null }))
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
    setTimeout(() => {
      const matched = allSchemes.filter(s => schemeMatchesProfile(s, profile))
      // Sort: state-specific first, then central
      matched.sort((a, b) => {
        if (a.issuing_body === 'central' && b.issuing_body !== 'central') return 1
        if (b.issuing_body === 'central' && a.issuing_body !== 'central') return -1
        return 0
      })
      setResults(matched)
      setFilterBody('all')
      setSearchQuery('')
      setLoading(false)
    }, 0)
  }, [allSchemes, profile])

  const issuingBodies = useMemo(() => {
    if (!results) return []
    const bodies = [...new Set(results.map(s => s.issuing_body).filter(Boolean))]
    // Sort: state bodies first, then central
    return bodies.sort((a, b) => {
      if (a === 'central') return 1
      if (b === 'central') return -1
      return a.localeCompare(b)
    })
  }, [results])

  const displayed = useMemo(() => {
    if (!results) return []
    let filtered = filterBody === 'all' ? results : results.filter(s => s.issuing_body === filterBody)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(s =>
        s.name?.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q) ||
        s.benefits?.toLowerCase().includes(q)
      )
    }
    return filtered
  }, [results, filterBody, searchQuery])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header onReset={handleReset} hasResults={results !== null} />

      <main style={{
        flex: 1, maxWidth: 1100, margin: '0 auto', width: '100%', padding: '28px 20px',
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
          {/* Sync status banners */}
          {syncStatus === 'syncing' && (
            <div style={{ background: 'rgba(15,32,68,0.05)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '9px 14px', fontSize: '0.83rem', color: 'var(--text-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 13, height: 13, border: '2px solid var(--border)', borderTopColor: 'var(--navy)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
              Checking for updates…
            </div>
          )}
          {syncStatus === 'updated' && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 'var(--radius-sm)', padding: '9px 14px', fontSize: '0.83rem', color: '#15803d', marginBottom: 12 }}>
              ✓ Schemes updated with latest data
            </div>
          )}
          {syncStatus === 'offline' && (
            <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 'var(--radius-sm)', padding: '9px 14px', fontSize: '0.83rem', color: '#92400e', marginBottom: 12 }}>
              📴 Offline — showing saved data. Will sync when back online.
            </div>
          )}
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 'var(--radius-sm)', padding: '12px 16px', color: '#b91c1c', fontSize: '0.88rem', marginBottom: 16 }}>
              ⚠️ {error}
              <button onClick={() => window.location.reload()} style={{ marginLeft: 12, fontSize: '0.83rem', color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                Retry
              </button>
            </div>
          )}

          {/* Empty state */}
          {results === null && !error && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '3rem', marginBottom: 16 }}>🔍</div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: 8, color: 'var(--navy)' }}>Fill in your details</h3>
              <p style={{ fontSize: '0.9rem', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>
                Enter your information on the left and click "Find Schemes" — the more fields you fill, the more accurately we can match you.
              </p>
              <div style={{ marginTop: 28, display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                {Object.entries(ISSUING_BODY_CONFIG).map(([key, conf]) => (
                  <span key={key} style={{ padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, background: conf.bg, color: conf.color }}>
                    {conf.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {results !== null && (
            <>
              <StatsBar
                results={results}
                displayed={displayed}
                filterBody={filterBody}
                setFilterBody={setFilterBody}
                issuingBodies={issuingBodies}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
              />

              {displayed.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px', background: 'white', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>😔</div>
                  <h3 style={{ color: 'var(--navy)', marginBottom: 8 }}>
                    {results.length === 0 ? 'No matching schemes found' : 'No schemes match your search'}
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                    {results.length === 0
                      ? 'Try leaving some fields blank, or adjusting your income / state.'
                      : 'Try a different keyword or clear the search.'}
                  </p>
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} style={{ marginTop: 12, fontSize: '0.85rem', color: 'var(--saffron)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}>
                      Clear search
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
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

      <footer style={{ background: 'var(--navy)', color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '16px 20px', fontSize: '0.78rem', lineHeight: 1.8 }}>
        <div>
          Welfare Scheme Finder · Covers Central + Delhi · Haryana · Karnataka · Maharashtra · Tamil Nadu · Telangana
        </div>
        <div style={{ marginTop: 2 }}>
          Information sourced from{' '}
          <a href="https://www.india.gov.in" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'underline' }}>India.gov.in</a>
          {' '}and respective state government portals · Always verify details on official portals before applying
        </div>
      </footer>
    </div>
  )
}
