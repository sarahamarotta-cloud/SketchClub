'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getDailyPrompt, getDailyCriteria, generateGameCode } from '@/lib/game-data'
import { useToast } from '@/components/Toast'

type Mode = 'home' | 'create' | 'join'

export default function LandingPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const [mode, setMode] = useState<Mode>('home')
  const [name, setName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    if (!name.trim()) {
      showToast('Please enter your name', 'error')
      return
    }
    setLoading(true)
    try {
      const supabase = createClient()
      const code = generateGameCode()
      const prompt = getDailyPrompt()
      const criteria = getDailyCriteria()

      const { data: game, error: gameError } = await supabase
        .from('games')
        .insert({ code, host_name: name.trim(), prompt, criteria })
        .select()
        .single()

      if (gameError) throw gameError

      const { error: playerError } = await supabase
        .from('players')
        .insert({ game_id: game.id, name: name.trim(), is_host: true })

      if (playerError) throw playerError

      localStorage.setItem('playerName', name.trim())
      router.push(`/lobby/${code}`)
    } catch (err) {
      console.error(err)
      showToast('Failed to create game. Please try again.', 'error')
      setLoading(false)
    }
  }

  async function handleJoin() {
    if (!name.trim()) {
      showToast('Please enter your name', 'error')
      return
    }
    const code = joinCode.trim().toUpperCase()
    if (code.length !== 6) {
      showToast('Please enter a valid 6-character game code', 'error')
      return
    }
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: game, error: gameError } = await supabase
        .from('games')
        .select()
        .eq('code', code)
        .single()

      if (gameError || !game) {
        showToast('Game not found. Check your code and try again.', 'error')
        setLoading(false)
        return
      }

      if (game.status !== 'lobby') {
        showToast('This game has already started.', 'error')
        setLoading(false)
        return
      }

      const { error: playerError } = await supabase
        .from('players')
        .insert({ game_id: game.id, name: name.trim(), is_host: false })

      if (playerError) throw playerError

      localStorage.setItem('playerName', name.trim())
      router.push(`/lobby/${code}`)
    } catch (err) {
      console.error(err)
      showToast('Failed to join game. Please try again.', 'error')
      setLoading(false)
    }
  }

  return (
    <div className="screen" style={{ justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        {/* Logo / Header */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h1 style={{
            fontFamily: 'var(--font-cormorant, "Cormorant Garamond", serif)',
            fontSize: '52px',
            fontWeight: 300,
            color: 'var(--charcoal)',
            letterSpacing: '-0.02em',
            lineHeight: 1,
            marginBottom: '8px',
          }}>
            SketchClub
          </h1>
          <p style={{ color: 'var(--clay)', fontSize: '14px', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>
            Draw. Roast. Repeat.
          </p>
        </div>

        {mode === 'home' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button className="btn-primary" onClick={() => setMode('create')}>
              Create a Game
            </button>
            <button className="btn-secondary" onClick={() => setMode('join')}>
              Join with Code
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--earth)', marginBottom: '6px', letterSpacing: '0.04em', fontWeight: 500 }}>
                Your name
              </label>
              <input
                className="input-base"
                type="text"
                placeholder="Enter your name"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                maxLength={24}
                autoFocus
              />
            </div>
            <button className="btn-primary" onClick={handleCreate} disabled={loading}>
              {loading ? 'Creating...' : 'Create Game'}
            </button>
            <button className="btn-secondary" onClick={() => setMode('home')} disabled={loading}>
              Back
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--earth)', marginBottom: '6px', letterSpacing: '0.04em', fontWeight: 500 }}>
                Your name
              </label>
              <input
                className="input-base"
                type="text"
                placeholder="Enter your name"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={24}
                autoFocus
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--earth)', marginBottom: '6px', letterSpacing: '0.04em', fontWeight: 500 }}>
                Game code
              </label>
              <input
                className="input-base"
                type="text"
                placeholder="6-character code"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                maxLength={6}
                style={{ textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 500, fontSize: '18px' }}
              />
            </div>
            <button className="btn-primary" onClick={handleJoin} disabled={loading}>
              {loading ? 'Joining...' : 'Join Game'}
            </button>
            <button className="btn-secondary" onClick={() => setMode('home')} disabled={loading}>
              Back
            </button>
          </div>
        )}

        <p style={{ textAlign: 'center', color: 'var(--bark)', fontSize: '12px', marginTop: '40px', lineHeight: 1.5 }}>
          A multiplayer drawing game with an AI judge.
          <br />No account required.
        </p>
      </div>
    </div>
  )
}
