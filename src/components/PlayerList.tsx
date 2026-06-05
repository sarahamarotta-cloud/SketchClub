'use client'

import { Player } from '@/lib/types'

interface PlayerListProps {
  players: Player[]
  currentName?: string
}

export function PlayerList({ players, currentName }: PlayerListProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {players.map(player => (
        <div key={player.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'var(--parchment)',
              border: '1.5px solid var(--bark)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-cormorant, "Cormorant Garamond", serif)',
              fontSize: '16px',
              color: 'var(--earth)',
              fontWeight: 500,
            }}>
              {player.name.charAt(0).toUpperCase()}
            </div>
            <span style={{
              fontSize: '15px',
              fontWeight: player.name === currentName ? 600 : 400,
              color: 'var(--charcoal)',
            }}>
              {player.name}
              {player.name === currentName && <span style={{ color: 'var(--bark)', fontSize: '13px', marginLeft: '4px' }}>(you)</span>}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {player.is_host && (
              <span className="badge badge-host">Host</span>
            )}
            {player.drawing_url && (
              <span className="badge badge-ready">Ready</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
