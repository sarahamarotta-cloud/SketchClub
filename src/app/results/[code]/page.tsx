'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Game, Player } from '@/lib/types'
import { useToast } from '@/components/Toast'

export default function ResultsPage() {
  const params = useParams()
  const code = params.code as string
  const router = useRouter()
  const { showToast } = useToast()

  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadResults()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  async function loadResults() {
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

    // If still judging, subscribe and wait for results
    if (gameData.status !== 'results') {
      const channel = supabase
        .channel(`results-wait-${gameData.id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameData.id}` }, payload => {
          const updated = payload.new as Game
          if (updated.status === 'results') {
            supabase
              .from('players')
              .select()
              .eq('game_id', gameData.id)
              .order('points', { ascending: false })
              .then(({ data }) => {
                setPlayers(data || [])
                setLoading(false)
              })
          }
        })
        .subscribe()
      return () => { supabase.removeChannel(channel) }
    }

    const { data: playersData } = await supabase
      .from('players')
      .select()
      .eq('game_id', gameData.id)
      .order('points', { ascending: false })

    setPlayers(playersData || [])
    setLoading(false)
  }

  async function handleShare() {
    const shareData = {
      title: 'SketchClub Results',
      text: `We just played SketchClub! "${game?.prompt}" — check out the results!`,
      url: window.location.href,
    }
    if (navigator.share) {
      try {
        await navigator.share(shareData)
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(window.location.href)
      showToast('Results link copied to clipboard!')
    }
  }

  if (loading) {
    return (
      <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--bark)', fontSize: '14px', fontStyle: 'italic' }}>
            The judge is still deliberating...
          </p>
        </div>
      </div>
    )
  }

  const winner = players[0]
  const rankSymbols = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

  return (
    <div className="screen-scroll">
      <div style={{ padding: '32px 20px', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <p style={{ fontSize: '12px', color: 'var(--bark)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>
            The verdict is in
          </p>
          <h1 style={{
            fontFamily: 'var(--font-cormorant, "Cormorant Garamond", serif)',
            fontSize: '40px',
            fontWeight: 300,
            color: 'var(--charcoal)',
            marginBottom: '8px',
            lineHeight: 1.2,
          }}>
            Results
          </h1>
          {game && (
            <p style={{ color: 'var(--clay)', fontSize: '14px', fontStyle: 'italic' }}>
              &ldquo;{game.prompt}&rdquo;
            </p>
          )}
        </div>

        {/* Winner spotlight */}
        {winner && winner.drawing_url && (
          <div className="card" style={{ marginBottom: '24px', textAlign: 'center' }}>
            <p style={{ fontSize: '12px', color: 'var(--bark)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>
              Winner
            </p>
            <div style={{
              width: '100%',
              maxWidth: '300px',
              margin: '0 auto 12px',
              borderRadius: '8px',
              overflow: 'hidden',
              border: '2px solid var(--clay)',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={winner.drawing_url} alt={winner.name} style={{ width: '100%', display: 'block' }} />
            </div>
            <p style={{
              fontFamily: 'var(--font-cormorant, "Cormorant Garamond", serif)',
              fontSize: '26px',
              fontWeight: 500,
              color: 'var(--charcoal)',
              marginBottom: '4px',
            }}>
              {winner.name}
            </p>
            <p style={{ fontSize: '13px', color: 'var(--clay)', marginBottom: '8px' }}>
              {winner.points} {winner.points === 1 ? 'point' : 'points'}
            </p>
            {winner.roast && (
              <p style={{ fontSize: '14px', color: 'var(--earth)', fontStyle: 'italic', lineHeight: 1.5 }}>
                &ldquo;{winner.roast}&rdquo;
              </p>
            )}
          </div>
        )}

        {/* All drawings gallery */}
        {players.length > 1 && (
          <div style={{ marginBottom: '24px' }}>
            <p style={{ fontSize: '12px', color: 'var(--bark)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '12px' }}>
              All Drawings
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {players.slice(1).map((player, idx) => (
                <div key={player.id} className="card">
                  <div style={{ display: 'flex', gap: '12px' }}>
                    {player.drawing_url && (
                      <div style={{
                        width: '80px',
                        height: '80px',
                        flexShrink: 0,
                        borderRadius: '6px',
                        overflow: 'hidden',
                        border: '1px solid var(--sand)',
                      }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={player.drawing_url} alt={player.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 500, fontSize: '15px', color: 'var(--charcoal)' }}>{player.name}</span>
                        <span style={{ fontSize: '13px', color: 'var(--clay)' }}>{player.points} pts</span>
                      </div>
                      {player.roast && (
                        <p style={{ fontSize: '13px', color: 'var(--earth)', fontStyle: 'italic', lineHeight: 1.5 }}>
                          &ldquo;{player.roast}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leaderboard */}
        <div style={{ marginBottom: '32px' }}>
          <p style={{ fontSize: '12px', color: 'var(--bark)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '12px' }}>
            Leaderboard
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {players.map((player, idx) => (
              <div key={player.id} className="leaderboard-row">
                <span className={`leaderboard-rank${idx === 0 ? ' first' : ''}`}>
                  {rankSymbols[idx] || idx + 1}
                </span>
                <span style={{ flex: 1, fontWeight: idx === 0 ? 600 : 400, color: 'var(--charcoal)' }}>
                  {player.name}
                </span>
                <span style={{ fontFamily: 'var(--font-cormorant, "Cormorant Garamond", serif)', fontSize: '20px', color: 'var(--clay)', fontWeight: 500 }}>
                  {player.points}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button className="btn-secondary" onClick={handleShare}>
            Share Results
          </button>
          <button className="btn-primary" onClick={() => router.push('/')}>
            Play Again
          </button>
        </div>

        <p style={{ textAlign: 'center', color: 'var(--bark)', fontSize: '12px', marginTop: '32px' }}>
          SketchClub &mdash; Draw. Roast. Repeat.
        </p>
      </div>
    </div>
  )
}
