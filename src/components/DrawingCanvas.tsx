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
  // Darks / neutrals
  '#2C2420', // charcoal
  '#6B5240', // earth
  '#9C7B5E', // clay
  '#C4B49A', // bark
  '#FFFFFF', // white
  // Pastels
  '#F2C4C4', // pastel pink
  '#F2D9C4', // pastel peach
  '#F2EAC4', // pastel yellow
  '#D4EAC8', // pastel green
  '#C4D9F2', // pastel blue
  '#D4C4F2', // pastel lavender
  '#F2C4E8', // pastel rose
  // Mids
  '#8A9E82', // sage
  '#5C7054', // moss
  '#4A6FA5', // blue
  '#7B5EA7', // purple
  '#C0392B', // red
  '#E67E22', // orange
  '#27AE60', // green
  '#2980B9', // bright blue
]

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
    const canvasContainerRef = useRef<HTMLDivElement>(null)
    const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
    const [color, setColor] = useState(COLORS[0])
    const [brushSize, setBrushSize] = useState(4)
    const [showSizeSlider, setShowSizeSlider] = useState(false)
    const [undoStack, setUndoStack] = useState<ImageData[]>([])
    const [secsLeft, setSecsLeft] = useState(totalSecs)
    const [submitted, setSubmitted] = useState(false)
    const [showPromptOverlay, setShowPromptOverlay] = useState(true)
    const [promptFading, setPromptFading] = useState(false)

    const isDrawingRef = useRef(false)
    const lastPointRef = useRef<{ x: number; y: number } | null>(null)
    const pinchRef = useRef<{ dist: number; scale: number; tx: number; ty: number; midX: number; midY: number } | null>(null)
    const transformRef = useRef({ scale: 1, tx: 0, ty: 0 })
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    // Keep latest tool/color/size accessible inside event handlers without re-binding
    const toolRef = useRef(tool)
    const colorRef = useRef(color)
    const brushSizeRef = useRef(brushSize)
    const submittedRef = useRef(submitted)
    useEffect(() => { toolRef.current = tool }, [tool])
    useEffect(() => { colorRef.current = color }, [color])
    useEffect(() => { brushSizeRef.current = brushSize }, [brushSize])
    useEffect(() => { submittedRef.current = submitted }, [submitted])

    // Prompt overlay
    useEffect(() => {
      const t1 = setTimeout(() => setPromptFading(true), 2200)
      const t2 = setTimeout(() => setShowPromptOverlay(false), 2800)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }, [])

    // Size canvas to its direct container — critical for correct coordinate mapping
    useEffect(() => {
      const container = canvasContainerRef.current
      const canvas = canvasRef.current
      if (!container || !canvas) return

      function initCanvas(w: number, h: number) {
        if (!canvas || !w || !h) return
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
        canvas.style.width = w + 'px'
        canvas.style.height = h + 'px'
        const ctx = canvas.getContext('2d')!
        ctx.scale(dpr, dpr)
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, w, h)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
      }

      // Wait one frame for flex layout to settle before measuring
      const raf = requestAnimationFrame(() => {
        initCanvas(container.clientWidth, container.clientHeight)
      })

      const ro = new ResizeObserver(entries => {
        const e = entries[0]
        if (e) initCanvas(e.contentRect.width, e.contentRect.height)
      })
      ro.observe(container)

      return () => { cancelAnimationFrame(raf); ro.disconnect() }
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

    // Convert screen coords → canvas CSS-pixel coords (accounts for dpr scaling)
    function screenToCanvas(screenX: number, screenY: number) {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      // canvas.style.width === rect.width so this ratio is 1 (no extra scaling needed)
      // The ctx.scale(dpr,dpr) call means we draw in CSS pixels naturally
      const { scale, tx, ty } = transformRef.current
      return {
        x: ((screenX - rect.left) - tx) / scale,
        y: ((screenY - rect.top) - ty) / scale,
      }
    }

    function getCtx() {
      return canvasRef.current?.getContext('2d') ?? null
    }

    function saveUndo() {
      const canvas = canvasRef.current
      const ctx = getCtx()
      if (!ctx || !canvas) return
      try {
        const snap = ctx.getImageData(0, 0, canvas.width, canvas.height)
        setUndoStack(prev => [...prev.slice(-29), snap])
      } catch { /* ignore cross-origin */ }
    }

    function drawSegment(x1: number, y1: number, x2: number, y2: number) {
      const ctx = getCtx()
      if (!ctx) return
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = toolRef.current === 'eraser' ? '#FFFFFF' : colorRef.current
      ctx.lineWidth = toolRef.current === 'eraser' ? brushSizeRef.current * 4 : brushSizeRef.current
      ctx.stroke()
    }

    function startDraw(screenX: number, screenY: number) {
      if (submittedRef.current) return
      saveUndo()
      isDrawingRef.current = true
      lastPointRef.current = screenToCanvas(screenX, screenY)
    }

    function continueDraw(screenX: number, screenY: number) {
      if (!isDrawingRef.current || submittedRef.current) return
      const pt = screenToCanvas(screenX, screenY)
      const last = lastPointRef.current
      if (last) drawSegment(last.x, last.y, pt.x, pt.y)
      lastPointRef.current = pt
    }

    function endDraw() {
      isDrawingRef.current = false
      lastPointRef.current = null
    }

    // Mouse
    const onMouseDown = useCallback((e: React.MouseEvent) => {
      if (e.button !== 0) return
      startDraw(e.clientX, e.clientY)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const onMouseMove = useCallback((e: React.MouseEvent) => {
      continueDraw(e.clientX, e.clientY)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const onMouseUp = useCallback(() => endDraw(), [])

    // Touch
    const onTouchStart = useCallback((e: React.TouchEvent) => {
      e.preventDefault()
      if (e.touches.length === 1) {
        pinchRef.current = null
        startDraw(e.touches[0].clientX, e.touches[0].clientY)
      } else if (e.touches.length === 2) {
        endDraw()
        const t0 = e.touches[0], t1 = e.touches[1]
        const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)
        const tf = transformRef.current
        pinchRef.current = { dist, scale: tf.scale, tx: tf.tx, ty: tf.ty, midX: (t0.clientX + t1.clientX) / 2, midY: (t0.clientY + t1.clientY) / 2 }
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const onTouchMove = useCallback((e: React.TouchEvent) => {
      e.preventDefault()
      if (e.touches.length === 1 && !pinchRef.current) {
        continueDraw(e.touches[0].clientX, e.touches[0].clientY)
      } else if (e.touches.length === 2 && pinchRef.current) {
        const t0 = e.touches[0], t1 = e.touches[1]
        const newDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)
        const midX = (t0.clientX + t1.clientX) / 2
        const midY = (t0.clientY + t1.clientY) / 2
        const p = pinchRef.current
        const newScale = Math.min(Math.max(p.scale * (newDist / p.dist), 1), 5)
        const canvas = canvasRef.current
        if (canvas) {
          const rect = canvas.getBoundingClientRect()
          const anchorX = (p.midX - rect.left - p.tx) / p.scale
          const anchorY = (p.midY - rect.top - p.ty) / p.scale
          const newTx = midX - rect.left - anchorX * newScale
          const newTy = midY - rect.top - anchorY * newScale
          transformRef.current = { scale: newScale, tx: newTx, ty: newTy }
          canvas.style.transformOrigin = '0 0'
          canvas.style.transform = `translate(${newTx}px, ${newTy}px) scale(${newScale})`
        }
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const onTouchEnd = useCallback((e: React.TouchEvent) => {
      e.preventDefault()
      if (e.touches.length < 2) pinchRef.current = null
      if (e.touches.length === 0) endDraw()
    }, [])

    function handleUndo() {
      if (undoStack.length === 0) return
      const ctx = getCtx()
      const canvas = canvasRef.current
      if (!ctx || !canvas) return
      const snap = undoStack[undoStack.length - 1]
      ctx.putImageData(snap, 0, 0)
      setUndoStack(prev => prev.slice(0, -1))
    }

    function handleSubmit() {
      if (submittedRef.current) return
      setSubmitted(true)
      submittedRef.current = true
      if (timerRef.current) clearInterval(timerRef.current)
      const canvas = canvasRef.current
      if (!canvas) return
      // Reset transform before export so the full canvas is captured
      canvas.style.transform = ''
      transformRef.current = { scale: 1, tx: 0, ty: 0 }
      onSubmit(canvas.toDataURL('image/png'))
    }

    useImperativeHandle(ref, () => ({
      submit: () => canvasRef.current?.toDataURL('image/png') ?? ''
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
      <div className="canvas-screen" style={{ userSelect: 'none' }}>
        {/* Prompt overlay */}
        {showPromptOverlay && (
          <div className={`prompt-overlay${promptFading ? ' fading' : ''}`}>
            <p style={{ color: 'var(--bark)', fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '14px' }}>
              Your prompt
            </p>
            <h2 style={{
              fontFamily: 'var(--font-cormorant, "Cormorant Garamond", serif)',
              fontSize: '30px', fontWeight: 300, color: 'var(--cream)',
              textAlign: 'center', lineHeight: 1.3, maxWidth: '320px',
            }}>
              {prompt}
            </h2>
            <p style={{ color: 'var(--bark)', fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '20px', opacity: 0.7 }}>
              tap to dismiss
            </p>
          </div>
        )}

        {/* HUD */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px', background: 'var(--warm-white)',
          borderBottom: '1px solid var(--sand)', flexShrink: 0,
        }}>
          <span style={{ fontFamily: 'var(--font-cormorant, "Cormorant Garamond", serif)', fontSize: '18px', fontWeight: 300, color: 'var(--charcoal)' }}>
            SketchClub
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontFamily: 'var(--font-cormorant, "Cormorant Garamond", serif)',
              fontSize: '24px', fontWeight: 500,
              color: isUrgent ? 'var(--urgent)' : 'var(--charcoal)',
              transition: 'color 0.3s', minWidth: '44px', textAlign: 'right',
            }}>
              {timeDisplay}
            </span>
            <svg width="44" height="44" viewBox="0 0 48 48" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="24" cy="24" r={radius} fill="none" stroke="var(--sand)" strokeWidth="3" />
              <circle cx="24" cy="24" r={radius} fill="none"
                stroke={isUrgent ? 'var(--urgent)' : 'var(--clay)'}
                strokeWidth="3" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={dashOffset}
                style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
              />
            </svg>
          </div>
        </div>

        {/* Prompt strip */}
        <div style={{
          background: 'var(--parchment)', borderBottom: '1px solid var(--sand)',
          padding: '6px 16px', flexShrink: 0, textAlign: 'center',
        }}>
          <p style={{ fontSize: '13px', color: 'var(--earth)', fontStyle: 'italic' }}>{prompt}</p>
        </div>

        {/* Canvas container — ref here so we measure only the drawable area */}
        <div ref={canvasContainerRef} style={{ flex: 1, overflow: 'hidden', position: 'relative', background: '#FFFFFF', touchAction: 'none', minHeight: 0 }}>
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute', top: 0, left: 0,
              cursor: tool === 'eraser' ? 'cell' : 'crosshair',
              touchAction: 'none',
              display: 'block',
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
        <div className="toolbar">
          {/* Pen */}
          <button className={`tool-btn${tool === 'pen' ? ' active' : ''}`} onClick={() => setTool('pen')} title="Pen">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
            </svg>
          </button>

          {/* Eraser */}
          <button className={`tool-btn${tool === 'eraser' ? ' active' : ''}`} onClick={() => setTool('eraser')} title="Eraser">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 20H7L3 16l10-10 7 7-4.5 4.5"/><path d="M6.5 17.5l3-3"/>
            </svg>
          </button>

          {/* Undo */}
          <button className="tool-btn" onClick={handleUndo} disabled={undoStack.length === 0}
            title="Undo" style={{ opacity: undoStack.length === 0 ? 0.4 : 1 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
            </svg>
          </button>

          {/* Brush size dot */}
          <button className={`tool-btn${showSizeSlider ? ' active' : ''}`}
            onClick={() => setShowSizeSlider(s => !s)} title="Brush size">
            <div style={{ width: Math.min(brushSize * 2.5, 18), height: Math.min(brushSize * 2.5, 18), borderRadius: '50%', background: 'currentColor' }} />
          </button>

          {showSizeSlider && (
            <input type="range" min={1} max={24} value={brushSize}
              onChange={e => setBrushSize(Number(e.target.value))}
              style={{ width: '72px', cursor: 'pointer', flexShrink: 0 }} />
          )}

          <div style={{ width: '1px', height: '24px', background: 'var(--sand)', flexShrink: 0, margin: '0 2px' }} />

          {/* Colors */}
          {COLORS.map(c => (
            <button key={c}
              className={`color-swatch${color === c && tool === 'pen' ? ' active' : ''}`}
              style={{
                background: c,
                border: c === '#FFFFFF' ? '2px solid var(--sand)' : '2px solid transparent',
                outline: color === c && tool === 'pen' ? '2px solid var(--charcoal)' : 'none',
                outlineOffset: '2px',
              }}
              onClick={() => { setColor(c); setTool('pen') }}
            />
          ))}

          <div style={{ flexShrink: 0, marginLeft: 'auto', paddingLeft: '8px' }}>
            <button className="btn-primary" onClick={handleSubmit} disabled={submitted}
              style={{ width: 'auto', padding: '6px 14px', fontSize: '12px', whiteSpace: 'nowrap' }}>
              {submitted ? 'Submitted' : 'Submit'}
            </button>
          </div>
        </div>
      </div>
    )
  }
)
