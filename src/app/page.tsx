'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getDailyPrompt, getDailyCriteria, generateGameCode } from '@/lib/game-data'
import { useToast } from '@/components/Toast'

type Mode = 'home' | 'create' | 'join'

function LandingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { showToast } = useToast()
  const [mode, setMode] = useState<Mode>('home')
  const [name, setName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)

  // Pre-fill code from URL param and jump straight to join mode
  useEffect(() => {
    const codeParam = searchParams.get('code')
    if (codeParam) {
      setJoinCode(codeParam.toUpperCase())
      setMode('join')
    }
  }, [searchParams])

  async function handleCreate() {
    if (!name.trim()) { showToast('Please enter your name', 'error'); return }
    setLoading(true)
    try {
      const supabase = createClient()
      const code = generateGameCode()
      const { data: game, error: gameError } = await supabase
        .from('games')
        .insert({ code, host_name: name.trim(), prompt: getDailyPrompt(), criteria: getDailyCriteria() })
        .select().single()
      if (gameError) throw gameError
      await supabase.from('players').insert({ game_id: game.id, name: name.trim(), is_host: true })
      localStorage.setItem('playerName', name.trim())
      router.push(`/lobby/${code}`)
    } catch (err) {
      console.error(err)
      showToast('Failed to create game. Please try again.', 'error')
      setLoading(false)
    }
  }

  async function handleJoin(overrideCode?: string) {
    if (!name.trim()) { showToast('Please enter your name', 'error'); return }
    const code = (overrideCode ?? joinCode).trim().toUpperCase()
    if (code.length !== 6) { showToast('Please enter a valid 6-character game code', 'error'); return }
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: game, error } = await supabase.from('games').select().eq('code', code).single()
      if (error || !game) { showToast('Game not found. Check your code and try again.', 'error'); setLoading(false); return }
      if (game.status !== 'lobby') { showToast('This game has already started.', 'error'); setLoading(false); return }
      const { error: playerError } = await supabase.from('players').insert({ game_id: game.id, name: name.trim(), is_host: false })
      if (playerError) throw playerError
      localStorage.setItem('playerName', name.trim())
      router.push(`/lobby/${code}`)
    } catch (err) {
      console.error(err)
      showToast('Failed to join game. Please try again.', 'error')
      setLoading(false)
    }
  }

  async function handleDemo() {
    const demoName = name.trim() || 'You'
    setLoading(true)
    try {
      const supabase = createClient()
      const code = generateGameCode()
      const { data: game, error: gameError } = await supabase
        .from('games')
        .insert({ code, host_name: demoName, prompt: getDailyPrompt(), criteria: getDailyCriteria(), draw_time_secs: 60 })
        .select().single()
      if (gameError) throw gameError

      // Insert the real player as host
      await supabase.from('players').insert({ game_id: game.id, name: demoName, is_host: true })

      // Insert two bot players
      await supabase.from('players').insert([
        { game_id: game.id, name: 'Alex (Bot)', is_host: false },
        { game_id: game.id, name: 'Jamie (Bot)', is_host: false },
      ])

      localStorage.setItem('playerName', demoName)
      localStorage.setItem('demoMode', 'true')
      router.push(`/lobby/${code}?demo=true`)
    } catch (err) {
      console.error(err)
      showToast('Failed to start demo. Please try again.', 'error')
      setLoading(false)
    }
  }

  return (
    <div className="screen" style={{ justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h1 style={{
            fontFamily: 'var(--font-cormorant, "Cormorant Garamond", serif)',
            fontSize: '52px', fontWeight: 300, color: 'var(--charcoal)',
            letterSpacing: '-0.02em', lineHeight: 1, marginBottom: '8px',
          }}>SketchClub</h1>
          <p style={{ color: 'var(--clay)', fontSize: '14px', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>
            Draw. Roast. Repeat.
          </p>
        </div>

        {mode === 'home' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button className="btn-primary" onClick={() => setMode('create')}>Create a Game</button>
            <button className="btn-secondary" onClick={() => setMode('join')}>Join with Code</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '4px 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--sand)' }} />
              <span style={{ fontSize: '11px', color: 'var(--bark)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>or</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--sand)' }} />
            </div>
            <button
              onClick={handleDemo}
              disabled={loading}
              style={{
                background: 'transparent', border: '1px dashed var(--bark)',
                color: 'var(--earth)', borderRadius: '4px', padding: '12px 20px',
                fontSize: '13px', cursor: 'pointer', letterSpacing: '0.04em',
                fontFamily: 'inherit', transition: 'all 0.2s',
              }}
            >
              {loading ? 'Starting...' : 'Try Demo (solo)'}
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--earth)', marginBottom: '6px', letterSpacing: '0.04em', fontWeight: 500 }}>
                Your name
              </label>
              <input className="input-base" type="text" placeholder="Enter your name" value={name}
                onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreate()}
                maxLength={24} autoFocus />
            </div>
            <button className="btn-primary" onClick={handleCreate} disabled={loading}>
              {loading ? 'Creating...' : 'Create Game'}
            </button>
            <button className="btn-secondary" onClick={() => setMode('home')} disabled={loading}>Back</button>
          </div>
        )}

        {mode === 'join' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--earth)', marginBottom: '6px', letterSpacing: '0.04em', fontWeight: 500 }}>
                Your name
              </label>
              <input className="input-base" type="text" placeholder="Enter your name" value={name}
                onChange={e => setName(e.target.value)} maxLength={24} autoFocus />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--earth)', marginBottom: '6px', letterSpacing: '0.04em', fontWeight: 500 }}>
                Game code
              </label>
              <input className="input-base" type="text" placeholder="6-character code" value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                maxLength={6} style={{ textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 500, fontSize: '18px' }} />
            </div>
            <button className="btn-primary" onClick={() => handleJoin()} disabled={loading}>
              {loading ? 'Joining...' : 'Join Game'}
            </button>
            <button className="btn-secondary" onClick={() => { setMode('home'); setJoinCode('') }} disabled={loading}>Back</button>
          </div>
        )}

        <p style={{ textAlign: 'center', color: 'var(--bark)', fontSize: '12px', marginTop: '40px', lineHeight: 1.5 }}>
          A multiplayer drawing game with an AI judge.<br />No account required.
        </p>
      </div>
    </div>
  )
}

export default function LandingPage() {
  return (
    <Suspense fallback={<div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>}>
      <LandingContent />
    </Suspense>
  )
}
