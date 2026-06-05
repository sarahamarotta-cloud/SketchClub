'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

const COLORS = [
  '#2C2420', // charcoal (default)
  '#FFFFFF', // white
  '#9C7B5E', // clay
  '#8A9E82', // sage
  '#A93226', // urgent/red
  '#5C7054', // moss
  '#C4B49A', // bark
  '#6B5240', // earth
  '#D4C4A8', // sand
  '#4A6FA5', // blue
  '#E8C547', // yellow
]

interface Stroke {
  tool: 'pen' | 'eraser'
  color: string
  size: number
  points: { x: number; y: number }[]
}

export interface DrawingCanvasHandle {
  submit: () => string
}

interface DrawingCanvasProps {
  onSubmit: (dataUrl: string) => void
  totalSecs: number
  prompt: string
}

export const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(
  function DrawingCanvas({ onSubmit, totalSecs, prompt }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
    const [color, setColor] = useState(COLORS[0])
    const [brushSize, setBrushSize] = useState(4)
    const [showSizeSlider, setShowSizeSlider] = useState(false)
    const [undoStack, setUndoStack] = useState<ImageData[]>([])
    const [secsLeft, setSecsLeft] = useState(totalSecs)
    const [submitted, setSubmitted] = useState(false)
    const [showPromptOverlay, setShowPromptOverlay] = useState(true)
    const [promptFading, setPromptFading] = useState(false)

    // Canvas transform state
    const transformRef = useRef({ scale: 1, tx: 0, ty: 0 })
    const isDrawingRef = useRef(false)
    const lastPointRef = useRef<{ x: number; y: number } | null>(null)
    const currentStrokeRef = useRef<{ x: number; y: number }[]>([])
    const pinchRef = useRef<{ dist: number; midX: number; midY: number } | null>(null)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // Prompt overlay: show 2.8s then fade
    useEffect(() => {
      const fadeTimer = setTimeout(() => setPromptFading(true), 2200)
      const hideTimer = setTimeout(() => setShowPromptOverlay(false), 2800)
      return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer) }
    }, [])

    // Countdown timer
    useEffect(() => {
      if (submitted) return
      timerRef.current = setInterval(() => {
        setSecsLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!)
            handleSubmit()
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => { if (timerRef.current) clearInterval(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [submitted])

    // Initialize canvas
    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }, [])

    function getCanvasContext() {
      const canvas = canvasRef.current
      if (!canvas) return null
      return canvas.getContext('2d')
    }

    function saveUndo() {
      const ctx = getCanvasContext()
      const canvas = canvasRef.current
      if (!ctx || !canvas) return
      setUndoStack(prev => [...prev.slice(-19), ctx.getImageData(0, 0, canvas.width, canvas.height)])
    }

    function screenToCanvas(screenX: number, screenY: number) {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      const { scale, tx, ty } = transformRef.current
      const relX = screenX - rect.left - tx
      const relY = screenY - rect.top - ty
      return { x: relX / scale, y: relY / scale }
    }

    function applyTransform() {
      const canvas = canvasRef.current
      if (!canvas) return
      const { scale, tx, ty } = transformRef.current
      canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`
      canvas.style.transformOrigin = '0 0'
    }

    function startDraw(screenX: number, screenY: number) {
      if (submitted) return
      saveUndo()
      isDrawingRef.current = true
      currentStrokeRef.current = []
      const pt = screenToCanvas(screenX, screenY)
      lastPointRef.current = pt
      currentStrokeRef.current.push(pt)

      const ctx = getCanvasContext()
      if (!ctx) return
      ctx.beginPath()
      ctx.moveTo(pt.x, pt.y)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = tool === 'eraser' ? '#FFFFFF' : color
      ctx.lineWidth = tool === 'eraser' ? brushSize * 3 : brushSize
    }

    function continueDraw(screenX: number, screenY: number) {
      if (!isDrawingRef.current || submitted) return
      const ctx = getCanvasContext()
      if (!ctx) return
      const pt = screenToCanvas(screenX, screenY)
      const last = lastPointRef.current!

      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(pt.x, pt.y)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = tool === 'eraser' ? '#FFFFFF' : color
      ctx.lineWidth = tool === 'eraser' ? brushSize * 3 : brushSize
      ctx.stroke()

      lastPointRef.current = pt
      currentStrokeRef.current.push(pt)
    }

    function endDraw() {
      isDrawingRef.current = false
      lastPointRef.current = null
    }

    // Mouse handlers
    const onMouseDown = useCallback((e: React.MouseEvent) => {
      if (e.button !== 0) return
      startDraw(e.clientX, e.clientY)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tool, color, brushSize, submitted])

    const onMouseMove = useCallback((e: React.MouseEvent) => {
      continueDraw(e.clientX, e.clientY)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tool, color, brushSize, submitted])

    const onMouseUp = useCallback(() => endDraw(), [])

    // Touch handlers
    function getTouchDist(t1: React.Touch, t2: React.Touch) {
      const dx = t2.clientX - t1.clientX
      const dy = t2.clientY - t1.clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    function getTouchMid(t1: React.Touch, t2: React.Touch) {
      return {
        midX: (t1.clientX + t2.clientX) / 2,
        midY: (t1.clientY + t2.clientY) / 2,
      }
    }

    const onTouchStart = useCallback((e: React.TouchEvent) => {
      e.preventDefault()
      if (e.touches.length === 1) {
        const t = e.touches[0]
        startDraw(t.clientX, t.clientY)
      } else if (e.touches.length === 2) {
        endDraw()
        const t1 = e.touches[0]
        const t2 = e.touches[1]
        pinchRef.current = {
          dist: getTouchDist(t1, t2),
          ...getTouchMid(t1, t2),
        }
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tool, color, brushSize, submitted])

    const onTouchMove = useCallback((e: React.TouchEvent) => {
      e.preventDefault()
      if (e.touches.length === 1 && !pinchRef.current) {
        const t = e.touches[0]
        continueDraw(t.clientX, t.clientY)
      } else if (e.touches.length === 2 && pinchRef.current) {
        const t1 = e.touches[0]
        const t2 = e.touches[1]
        const newDist = getTouchDist(t1, t2)
        const { midX, midY } = getTouchMid(t1, t2)
        const scaleChange = newDist / pinchRef.current.dist
        const tf = transformRef.current
        const newScale = Math.min(Math.max(tf.scale * scaleChange, 0.5), 4)

        // Zoom towards pinch midpoint
        const canvas = canvasRef.current
        if (canvas) {
          const rect = canvas.getBoundingClientRect()
          const canvasMidX = midX - rect.left
          const canvasMidY = midY - rect.top
          tf.tx = canvasMidX - (canvasMidX - tf.tx) * (newScale / tf.scale)
          tf.ty = canvasMidY - (canvasMidY - tf.ty) * (newScale / tf.scale)
          tf.scale = newScale
          applyTransform()
        }

        pinchRef.current = { dist: newDist, midX, midY }
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tool, color, brushSize, submitted])

    const onTouchEnd = useCallback((e: React.TouchEvent) => {
      e.preventDefault()
      if (e.touches.length < 2) {
        pinchRef.current = null
      }
      if (e.touches.length === 0) {
        endDraw()
      }
    }, [])

    function handleUndo() {
      if (undoStack.length === 0) return
      const ctx = getCanvasContext()
      const canvas = canvasRef.current
      if (!ctx || !canvas) return
      const last = undoStack[undoStack.length - 1]
      ctx.putImageData(last, 0, 0)
      setUndoStack(prev => prev.slice(0, -1))
    }

    function handleSubmit() {
      if (submitted) return
      setSubmitted(true)
      if (timerRef.current) clearInterval(timerRef.current)
      const canvas = canvasRef.current
      if (!canvas) return
      const dataUrl = canvas.toDataURL('image/png')
      onSubmit(dataUrl)
    }

    useImperativeHandle(ref, () => ({
      submit: () => {
        const canvas = canvasRef.current
        if (!canvas) return ''
        return canvas.toDataURL('image/png')
      }
    }))

    const radius = 20
    const circumference = 2 * Math.PI * radius
    const progress = totalSecs > 0 ? secsLeft / totalSecs : 0
    const dashOffset = circumference * (1 - progress)
    const isUrgent = secsLeft <= 10
    const mins = Math.floor(secsLeft / 60)
    const secs = secsLeft % 60
    const timeDisplay = `${mins}:${secs.toString().padStart(2, '0')}`

    return (
      <div className="canvas-screen" ref={containerRef}>
        {/* Prompt overlay */}
        {showPromptOverlay && (
          <div className={`prompt-overlay${promptFading ? ' fading' : ''}`}>
            <p style={{ color: 'var(--bark)', fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '16px' }}>
              Your prompt
            </p>
            <h2 style={{
              fontFamily: 'var(--font-cormorant, "Cormorant Garamond", serif)',
              fontSize: '32px',
              fontWeight: 300,
              color: 'var(--cream)',
              textAlign: 'center',
              lineHeight: 1.3,
              maxWidth: '340px',
            }}>
              {prompt}
            </h2>
          </div>
        )}

        {/* HUD */}
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
          <span style={{
            fontFamily: 'var(--font-cormorant, "Cormorant Garamond", serif)',
            fontSize: '20px',
            fontWeight: 300,
            color: 'var(--charcoal)',
          }}>
            SketchClub
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontFamily: 'var(--font-cormorant, "Cormorant Garamond", serif)',
              fontSize: '26px',
              fontWeight: 500,
              color: isUrgent ? 'var(--urgent)' : 'var(--charcoal)',
              transition: 'color 0.3s',
              minWidth: '48px',
              textAlign: 'right',
            }}>
              {timeDisplay}
            </span>
            <svg width="44" height="44" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r={radius} fill="none" stroke="var(--sand)" strokeWidth="3" />
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

        {/* Prompt strip */}
        <div style={{
          background: 'var(--parchment)',
          borderBottom: '1px solid var(--sand)',
          padding: '8px 16px',
          flexShrink: 0,
          textAlign: 'center',
        }}>
          <p style={{ fontSize: '13px', color: 'var(--earth)', fontStyle: 'italic' }}>
            {prompt}
          </p>
        </div>

        {/* Canvas area */}
        <div style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          background: 'var(--parchment)',
          touchAction: 'none',
        }}>
          <canvas
            ref={canvasRef}
            width={1200}
            height={1200}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              cursor: tool === 'eraser' ? 'cell' : 'crosshair',
              background: '#FFFFFF',
              touchAction: 'none',
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          />
        </div>

        {/* Toolbar */}
        <div className="toolbar" style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
          {/* Pen */}
          <button
            className={`tool-btn${tool === 'pen' ? ' active' : ''}`}
            onClick={() => setTool('pen')}
            title="Pen"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              <path d="M2 2l7.586 7.586" />
              <circle cx="11" cy="11" r="2" />
            </svg>
          </button>

          {/* Eraser */}
          <button
            className={`tool-btn${tool === 'eraser' ? ' active' : ''}`}
            onClick={() => setTool('eraser')}
            title="Eraser"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 20H7L3 16l10-10 7 7-4.5 4.5" />
              <path d="M6.5 17.5l3-3" />
            </svg>
          </button>

          {/* Undo */}
          <button
            className="tool-btn"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title="Undo"
            style={{ opacity: undoStack.length === 0 ? 0.4 : 1 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 14 4 9 9 4" />
              <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
            </svg>
          </button>

          {/* Brush size */}
          <button
            className={`tool-btn${showSizeSlider ? ' active' : ''}`}
            onClick={() => setShowSizeSlider(s => !s)}
            title="Brush size"
          >
            <div style={{
              width: Math.min(brushSize * 2, 18),
              height: Math.min(brushSize * 2, 18),
              borderRadius: '50%',
              background: 'var(--charcoal)',
            }} />
          </button>

          {/* Size slider (inline) */}
          {showSizeSlider && (
            <input
              type="range"
              min={1}
              max={20}
              value={brushSize}
              onChange={e => setBrushSize(Number(e.target.value))}
              style={{ width: '80px', cursor: 'pointer' }}
            />
          )}

          {/* Divider */}
          <div style={{ width: '1px', height: '28px', background: 'var(--sand)', flexShrink: 0, margin: '0 4px' }} />

          {/* Color swatches */}
          {COLORS.map(c => (
            <button
              key={c}
              className={`color-swatch${color === c && tool === 'pen' ? ' active' : ''}`}
              style={{ background: c, border: c === '#FFFFFF' ? '2px solid var(--sand)' : '2px solid transparent' }}
              onClick={() => { setColor(c); setTool('pen') }}
              title={c}
            />
          ))}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Submit button */}
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={submitted}
            style={{ width: 'auto', padding: '8px 16px', fontSize: '13px', flexShrink: 0 }}
          >
            {submitted ? 'Submitted' : 'Submit'}
          </button>
        </div>
      </div>
    )
  }
)
