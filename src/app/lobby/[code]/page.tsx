'use client'

import { useEffect, useState, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Game, Player } from '@/lib/types'
import { PlayerList } from '@/components/PlayerList'
import { useToast } from '@/components/Toast'

function LobbyContent() {
  const params = useParams()
  const code = params.code as string
  const router = useRouter()
  const searchParams = useSearchParams()
  const isDemo = searchParams.get('demo') === 'true'
  const { showToast } = useToast()

  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [playerName, setPlayerName] = useState<string>('')
  const [isHost, setIsHost] = useState(false)
  const [drawTime, setDrawTime] = useState(180)
  const [starting, setStarting] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const name = localStorage.getItem('playerName') || ''
    setPlayerName(name)
    loadGame(name)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  async function loadGame(name: string) {
    const supabase = createClient()
    const { data: gameData, error } = await supabase
      .from('games')
      .select()
      .eq('code', code)
      .single()

    if (error || !gameData) {
      showToast('Game not found.', 'error')
      router.push('/')
      return
    }

    setGame(gameData)
    setDrawTime(gameData.draw_time_secs)

    if (gameData.status === 'drawing') {
      router.push(`/draw/${code}`)
      return
    }

    const { data: playersData } = await supabase
      .from('players')
      .select()
      .eq('game_id', gameData.id)
      .order('joined_at', { ascending: true })

    setPlayers(playersData || [])
    const me = (playersData || []).find((p: Player) => p.name === name)
    setIsHost(me?.is_host || false)
    setLoading(false)

    // Subscribe to real-time changes
    const gameChannel = supabase
      .channel(`lobby-game-${gameData.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameData.id}` }, payload => {
        const updated = payload.new as Game
        setGame(updated)
        if (updated.status === 'drawing') {
          router.push(`/draw/${code}`)
        }
      })
      .subscribe()

    const playersChannel = supabase
      .channel(`lobby-players-${gameData.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameData.id}` }, () => {
        supabase
          .from('players')
          .select()
          .eq('game_id', gameData.id)
          .order('joined_at', { ascending: true })
          .then(({ data }) => setPlayers(data || []))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(gameChannel)
      supabase.removeChannel(playersChannel)
    }
  }

  async function handleStart() {
    if (!game) return
    if (players.length < 1) {
      showToast('Need at least one player to start.', 'error')
      return
    }
    setStarting(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('games')
      .update({ status: 'drawing', draw_time_secs: drawTime })
      .eq('id', game.id)

    if (error) {
      showToast('Failed to start game.', 'error')
      setStarting(false)
    }
  }

  async function copyCode() {
    await navigator.clipboard.writeText(code)
    showToast('Game code copied!')
  }

  async function copyInviteLink() {
    const url = `${window.location.origin}/join/${code}`
    await navigator.clipboard.writeText(url)
    showToast('Invite link copied!')
  }

  if (loading) {
    return (
      <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100dvh',
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch' as const,
      background: 'var(--cream)',
    }}>
      <div style={{ padding: '24px 20px 48px', maxWidth: '500px', margin: '0 auto', width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{
            fontFamily: 'var(--font-cormorant, "Cormorant Garamond", serif)',
            fontSize: '36px',
            fontWeight: 300,
            color: 'var(--charcoal)',
            marginBottom: '4px',
          }}>
            The Lobby
          </h1>
          <p style={{ color: 'var(--clay)', fontSize: '13px' }}>Waiting for players to join</p>
        </div>

        {/* Game code card */}
        <div className="card" style={{ marginBottom: '20px', textAlign: 'center' }}>
          <p style={{ fontSize: '12px', color: 'var(--bark)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
            Game Code
          </p>
          <button
            onClick={copyCode}
            style={{
              fontFamily: 'var(--font-cormorant, "Cormorant Garamond", serif)',
              fontSize: '48px', fontWeight: 600, letterSpacing: '0.12em',
              color: 'var(--charcoal)', background: 'none', border: 'none',
              cursor: 'pointer', padding: '4px 12px', borderRadius: '6px', transition: 'background 0.2s',
            }}
            onMouseOver={e => (e.currentTarget.style.background = 'var(--parchment)')}
            onMouseOut={e => (e.currentTarget.style.background = 'none')}
          >
            {code}
          </button>
          <p style={{ fontSize: '12px', color: 'var(--bark)', marginTop: '4px' }}>Tap to copy</p>
          <button
            onClick={copyInviteLink}
            style={{
              marginTop: '10px', background: 'transparent', border: '1px solid var(--sand)',
              color: 'var(--earth)', borderRadius: '4px', padding: '7px 16px',
              fontSize: '12px', cursor: 'pointer', letterSpacing: '0.06em',
              fontFamily: 'inherit', transition: 'all 0.2s',
            }}
          >
            Copy invite link
          </button>
        </div>

        {isDemo && (
          <div style={{
            background: 'var(--parchment)', border: '1px dashed var(--bark)',
            borderRadius: '4px', padding: '12px 16px', marginBottom: '20px',
            fontSize: '13px', color: 'var(--earth)', lineHeight: 1.5,
          }}>
            <strong style={{ color: 'var(--clay)' }}>Demo mode</strong> — two bot players are in the lobby.
            Start whenever you&apos;re ready; bots will auto-submit drawings.
          </div>
        )}

        {/* Prompt preview */}
        {game && (
          <div className="card" style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '12px', color: 'var(--bark)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>
              Today&apos;s Prompt
            </p>
            <p style={{ fontStyle: 'italic', color: 'var(--earth)', fontSize: '15px' }}>
              &ldquo;{game.prompt}&rdquo;
            </p>
            <p style={{ fontSize: '12px', color: 'var(--bark)', marginTop: '8px' }}>
              Judged by: {game.criteria}
            </p>
          </div>
        )}

        {/* Players */}
        <div style={{ marginBottom: '24px' }}>
          <p style={{ fontSize: '12px', color: 'var(--bark)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '10px' }}>
            Players ({players.length})
          </p>
          <PlayerList players={players} currentName={playerName} />
        </div>

        {/* Host controls */}
        {isHost && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="card">
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--earth)', marginBottom: '8px', fontWeight: 500 }}>
                Draw time: {Math.floor(drawTime / 60)}:{(drawTime % 60).toString().padStart(2, '0')}
              </label>
              <input
                type="range"
                min={60}
                max={300}
                step={30}
                value={drawTime}
                onChange={e => setDrawTime(Number(e.target.value))}
                style={{ width: '100%', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--bark)', marginTop: '4px' }}>
                <span>1 min</span>
                <span>5 min</span>
              </div>
            </div>
            <button className="btn-primary" onClick={handleStart} disabled={starting}>
              {starting ? 'Starting...' : 'Start Game'}
            </button>
          </div>
        )}

        {!isHost && (
          <div style={{ textAlign: 'center', color: 'var(--bark)', fontSize: '14px' }}>
            Waiting for the host to start the game...
          </div>
        )}
      </div>
    </div>
  )
}

export default function LobbyPage() {
  return (
    <Suspense fallback={<div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>}>
      <LobbyContent />
    </Suspense>
  )
}
