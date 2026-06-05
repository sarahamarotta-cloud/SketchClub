'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Game, Player } from '@/lib/types'
import { DrawingCanvas, DrawingCanvasHandle } from '@/components/DrawingCanvas'
import { useToast } from '@/components/Toast'

export default function DrawPage() {
  const params = useParams()
  const code = params.code as string
  const router = useRouter()
  const { showToast } = useToast()

  const [game, setGame] = useState<Game | null>(null)
  const [myPlayer, setMyPlayer] = useState<Player | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [submitting, setSubmitting] = useState(false)
  const canvasRef = useRef<DrawingCanvasHandle>(null)

  useEffect(() => {
    const name = localStorage.getItem('playerName') || ''
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

    const { data: playersData } = await supabase
      .from('players')
      .select()
      .eq('game_id', gameData.id)

    setPlayers(playersData || [])
    const me = (playersData || []).find((p: Player) => p.name === name)
    setMyPlayer(me || null)

    // Subscribe to game status changes (e.g., if host moves to waiting)
    const gameChannel = supabase
      .channel(`draw-game-${gameData.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameData.id}` }, payload => {
        const updated = payload.new as Game
        setGame(updated)
        if (updated.status === 'waiting' || updated.status === 'judging' || updated.status === 'results') {
          router.push(`/waiting/${code}`)
        }
      })
      .subscribe()

    const playersChannel = supabase
      .channel(`draw-players-${gameData.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players', filter: `game_id=eq.${gameData.id}` }, () => {
        supabase
          .from('players')
          .select()
          .eq('game_id', gameData.id)
          .then(({ data }) => {
            const updated = data || []
            setPlayers(updated)
            // If all players submitted, move to waiting
            const allSubmitted = updated.length > 0 && updated.every((p: Player) => p.drawing_url)
            if (allSubmitted) {
              const me2 = updated.find((p: Player) => p.name === name)
              if (me2?.is_host) {
                supabase.from('games').update({ status: 'waiting' }).eq('id', gameData.id).then(() => {
                  router.push(`/waiting/${code}`)
                })
              } else {
                router.push(`/waiting/${code}`)
              }
            }
          })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(gameChannel)
      supabase.removeChannel(playersChannel)
    }
  }

  async function handleSubmit(dataUrl: string) {
    if (submitting || !myPlayer || !game) return
    setSubmitting(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('players')
      .update({ drawing_url: dataUrl, submitted_at: new Date().toISOString() })
      .eq('id', myPlayer.id)

    if (error) {
      showToast('Failed to submit drawing. Please try again.', 'error')
      setSubmitting(false)
      return
    }

    // In demo mode, auto-submit fake drawings for bot players
    if (localStorage.getItem('demoMode') === 'true') {
      const bots = players.filter(p => p.name.endsWith('(Bot)') && !p.drawing_url)
      for (const bot of bots) {
        const fakeUrl = makeFakeDrawing(['#C4B49A', '#8A9E82', '#9C7B5E'][Math.floor(Math.random() * 3)])
        await supabase
          .from('players')
          .update({ drawing_url: fakeUrl, submitted_at: new Date().toISOString() })
          .eq('id', bot.id)
      }
    }

    showToast('Drawing submitted!')
    router.push(`/waiting/${code}`)
  }

  function makeFakeDrawing(color: string): string {
    const c = document.createElement('canvas')
    c.width = 300; c.height = 225
    const cx = c.getContext('2d')!
    cx.fillStyle = '#FAF7F2'; cx.fillRect(0, 0, 300, 225)
    cx.fillStyle = color; cx.globalAlpha = 0.15; cx.fillRect(20, 20, 260, 185); cx.globalAlpha = 1
    cx.strokeStyle = color; cx.lineWidth = 2; cx.lineCap = 'round'
    cx.beginPath(); cx.moveTo(40, 112)
    for (let i = 0; i < 8; i++) cx.lineTo(40 + i * 32, 112 + (i % 2 ? 1 : -1) * 28)
    cx.stroke()
    cx.lineWidth = 1.5; cx.strokeRect(116, 58, 68, 84)
    cx.beginPath(); cx.arc(150, 46, 14, 0, Math.PI * 2); cx.stroke()
    return c.toDataURL()
  }

  if (!game) {
    return (
      <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <DrawingCanvas
      ref={canvasRef}
      prompt={game.prompt}
      totalSecs={game.draw_time_secs}
      onSubmit={handleSubmit}
    />
  )
}
