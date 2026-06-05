'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Game, Player } from '@/lib/types'
import { useToast } from '@/components/Toast'

export default function WaitingPage() {
  const params = useParams()
  const code = params.code as string
  const router = useRouter()
  const { showToast } = useToast()

  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [isHost, setIsHost] = useState(false)
  const [judging, setJudging] = useState(false)

  useEffect(() => {
    const name = localStorage.getItem('playerName') || ''
    loadWaiting(name)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  async function loadWaiting(name: string) {
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

    if (gameData.status === 'results') {
      router.push(`/results/${code}`)
      return
    }

    const { data: playersData } = await supabase
      .from('players')
      .select()
      .eq('game_id', gameData.id)
      .order('joined_at', { ascending: true })

    const ps = playersData || []
    setPlayers(ps)
    const me = ps.find((p: Player) => p.name === name)
    setIsHost(me?.is_host || false)

    // Check if all already submitted
    if (ps.length > 0 && ps.every((p: Player) => p.drawing_url)) {
      if (me?.is_host) {
        triggerJudge(gameData, ps)
      }
    }

    // Subscribe to game status
    const gameChannel = supabase
      .channel(`waiting-game-${gameData.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameData.id}` }, payload => {
        const updated = payload.new as Game
        setGame(updated)
        if (updated.status === 'results') {
          router.push(`/results/${code}`)
        }
      })
      .subscribe()

    const playersChannel = supabase
      .channel(`waiting-players-${gameData.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players', filter: `game_id=eq.${gameData.id}` }, () => {
        supabase
          .from('players')
          .select()
          .eq('game_id', gameData.id)
          .order('joined_at', { ascending: true })
          .then(({ data }) => {
            const updated = data || []
            setPlayers(updated)
            const allDone = updated.length > 0 && updated.every((p: Player) => p.drawing_url)
            const meNow = updated.find((p: Player) => p.name === name)
            if (allDone && meNow?.is_host && !judging) {
              triggerJudge(gameData, updated)
            }
          })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(gameChannel)
      supabase.removeChannel(playersChannel)
    }
  }

  async function triggerJudge(gameData: Game, ps: Player[]) {
    if (judging) return
    setJudging(true)

    const supabase = createClient()
    await supabase.from('games').update({ status: 'judging' }).eq('id', gameData.id)

    try {
      const response = await fetch('/api/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameData.id,
          prompt: gameData.prompt,
          criteria: gameData.criteria,
          players: ps.map(p => ({ id: p.id, name: p.name })),
        }),
      })

      if (!response.ok) {
        throw new Error('Judge API failed')
      }
    } catch (err) {
      console.error('Judge error:', err)
      showToast('Judging failed. Moving to results anyway.', 'error')
      const supabase2 = createClient()
      await supabase2.from('games').update({ status: 'results' }).eq('id', gameData.id)
    }
  }

  const submitted = players.filter(p => p.drawing_url)
  const total = players.length
  const allDone = total > 0 && submitted.length === total

  return (
    <div style={{ minHeight: '100dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' as const, background: 'var(--cream)' }}>
      <div style={{ padding: '32px 20px 48px', maxWidth: '500px', margin: '0 auto', width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{
            fontFamily: 'var(--font-cormorant, "Cormorant Garamond", serif)',
            fontSize: '36px',
            fontWeight: 300,
            color: 'var(--charcoal)',
            marginBottom: '8px',
          }}>
            {allDone || judging ? 'The Judge Deliberates' : 'Waiting for Artists'}
          </h1>
          <p style={{ color: 'var(--clay)', fontSize: '14px' }}>
            {judging
              ? 'Our AI judge is reviewing the masterpieces...'
              : `${submitted.length} of ${total} drawings submitted`}
          </p>
        </div>

        {judging && (
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--bark)', fontSize: '13px', fontStyle: 'italic' }}>
              Analyzing artistic merit and structural chaos...
            </p>
          </div>
        )}

        {/* Thumbnail grid */}
        <div className="thumbnail-grid" style={{ marginBottom: '24px' }}>
          {players.map(player => (
            <div key={player.id} className="thumbnail-item">
              {player.drawing_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={player.drawing_url} alt={`${player.name}'s drawing`} />
              ) : (
                <div style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}>
                  <div className="spinner" style={{ width: '20px', height: '20px' }} />
                  <span style={{ fontSize: '11px', color: 'var(--bark)' }}>{player.name}</span>
                </div>
              )}
              {player.drawing_url && (
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: 'linear-gradient(transparent, rgba(44,36,32,0.7))',
                  padding: '16px 8px 6px',
                  fontSize: '11px',
                  color: '#FAF7F2',
                  textAlign: 'center',
                }}>
                  {player.name}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div style={{ height: '4px', background: 'var(--sand)', borderRadius: '2px', overflow: 'hidden', marginBottom: '16px' }}>
          <div style={{
            height: '100%',
            background: 'var(--clay)',
            borderRadius: '2px',
            width: `${total > 0 ? (submitted.length / total) * 100 : 0}%`,
            transition: 'width 0.5s ease',
          }} />
        </div>
      </div>
    </div>
  )
}
