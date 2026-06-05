'use client'

interface TimerHUDProps {
  totalSecs: number
  secsLeft: number
}

export function TimerHUD({ totalSecs, secsLeft }: TimerHUDProps) {
  const radius = 20
  const circumference = 2 * Math.PI * radius
  const progress = totalSecs > 0 ? secsLeft / totalSecs : 0
  const dashOffset = circumference * (1 - progress)
  const isUrgent = secsLeft <= 10
  const mins = Math.floor(secsLeft / 60)
  const secs = secsLeft % 60
  const timeDisplay = `${mins}:${secs.toString().padStart(2, '0')}`

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 16px',
      paddingTop: 'calc(8px + var(--safe-top))',
      background: 'var(--warm-white)',
      borderBottom: '1px solid var(--sand)',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <span style={{
        fontFamily: 'var(--font-cormorant, "Cormorant Garamond", serif)',
        fontSize: '22px',
        fontWeight: 300,
        color: 'var(--charcoal)',
        letterSpacing: '-0.01em',
      }}>
        SketchClub
      </span>

      {/* Timer display */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{
          fontFamily: 'var(--font-cormorant, "Cormorant Garamond", serif)',
          fontSize: '28px',
          fontWeight: 500,
          color: isUrgent ? 'var(--urgent)' : 'var(--charcoal)',
          letterSpacing: '-0.02em',
          transition: 'color 0.3s',
          minWidth: '52px',
          textAlign: 'right',
        }}>
          {timeDisplay}
        </span>

        {/* Arc ring */}
        <svg width="48" height="48" viewBox="0 0 48 48">
          {/* Background ring */}
          <circle
            cx="24" cy="24" r={radius}
            fill="none"
            stroke="var(--sand)"
            strokeWidth="3"
          />
          {/* Progress arc */}
          <circle
            className="timer-arc-ring"
            cx="24" cy="24" r={radius}
            fill="none"
            stroke={isUrgent ? 'var(--urgent)' : 'var(--clay)'}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
          />
        </svg>
      </div>
    </div>
  )
}
