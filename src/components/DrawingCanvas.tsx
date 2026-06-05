'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

const COLORS = [
  '#2C2420', '#6B5240', '#9C7B5E', '#C4B49A', '#FFFFFF',
  '#F2C4C4', '#F2D9C4', '#F2EAC4', '#D4EAC8', '#C4D9F2', '#D4C4F2', '#F2C4E8',
  '#8A9E82', '#5C7054', '#4A6FA5', '#7B5EA7', '#C0392B', '#E67E22', '#27AE60', '#2980B9',
]

export interface DrawingCanvasHandle { submit: () => string }

interface Props { onSubmit: (dataUrl: string) => void; totalSecs: number; prompt: string }

export const DrawingCanvas = forwardRef<DrawingCanvasHandle, Props>(
  function DrawingCanvas({ onSubmit, totalSecs, prompt }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const canvasBoxRef = useRef<HTMLDivElement>(null)   // direct parent of canvas
    const [tool, setTool]         = useState<'pen' | 'eraser'>('pen')
    const [color, setColor]       = useState(COLORS[0])
    const [brushSize, setBrushSize] = useState(4)
    const [undoStack, setUndoStack] = useState<ImageData[]>([])
    const [secsLeft, setSecsLeft] = useState(totalSecs)
    const [submitted, setSubmitted] = useState(false)
    const [showOverlay, setShowOverlay]   = useState(true)
    const [fadingOverlay, setFadingOverlay] = useState(false)

    // Refs so event handlers always see latest values without re-binding
    const toolRef      = useRef(tool)
    const colorRef     = useRef(color)
    const sizeRef      = useRef(brushSize)
    const submittedRef = useRef(false)
    useEffect(() => { toolRef.current = tool },      [tool])
    useEffect(() => { colorRef.current = color },    [color])
    useEffect(() => { sizeRef.current = brushSize }, [brushSize])

    const isDrawing  = useRef(false)
    const lastPt     = useRef<{ x: number; y: number } | null>(null)
    const pinchState = useRef<{ dist: number; scale: number; tx: number; ty: number; midX: number; midY: number } | null>(null)
    const transform  = useRef({ scale: 1, tx: 0, ty: 0 })
    const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null)
    const dprRef     = useRef(1)

    // Prompt overlay: auto-dismiss after 2.8s, click to dismiss early
    useEffect(() => {
      const t1 = setTimeout(() => setFadingOverlay(true), 2200)
      const t2 = setTimeout(() => setShowOverlay(false), 2800)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }, [])

    // ── Canvas sizing ─────────────────────────────────────────────────────────
    // The canvas CSS is always 100%×100% of its box so it always receives events.
    // We separately set the pixel buffer size to match × dpr.
    useEffect(() => {
      const box    = canvasBoxRef.current
      const canvas = canvasRef.current
      if (!box || !canvas) return

      function sizeCanvas() {
        if (!box || !canvas) return
        const w = box.clientWidth
        const h = box.clientHeight
        if (!w || !h) return
        const dpr = window.devicePixelRatio || 1
        dprRef.current = dpr
        canvas.width  = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
        // CSS size is handled by style width/height 100% — no need to set here
        const ctx = canvas.getContext('2d')!
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)   // scale once; draw in CSS px
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, w, h)
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      }

      // rAF lets the flex layout settle before we measure
      const raf = requestAnimationFrame(sizeCanvas)
      const ro  = new ResizeObserver(sizeCanvas)
      ro.observe(box)
      return () => { cancelAnimationFrame(raf); ro.disconnect() }
    }, [])

    // ── Timer ─────────────────────────────────────────────────────────────────
    useEffect(() => {
      if (submitted) return
      timerRef.current = setInterval(() => {
        setSecsLeft(prev => {
          if (prev <= 1) { clearInterval(timerRef.current!); doSubmit(); return 0 }
          return prev - 1
        })
      }, 1000)
      return () => { if (timerRef.current) clearInterval(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [submitted])

    // ── Coordinate mapping ────────────────────────────────────────────────────
    // ctx is scaled by dpr so draw calls use CSS pixels.
    // We just subtract canvas's top-left from client coords.
    function toCanvasPt(clientX: number, clientY: number) {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      const tf = transform.current
      return {
        x: ((clientX - rect.left) - tf.tx) / tf.scale,
        y: ((clientY - rect.top)  - tf.ty) / tf.scale,
      }
    }

    // ── Drawing primitives ────────────────────────────────────────────────────
    function saveSnap() {
      const c = canvasRef.current; const ctx = c?.getContext('2d')
      if (!ctx || !c) return
      try { setUndoStack(p => [...p.slice(-29), ctx.getImageData(0, 0, c.width, c.height)]) } catch {}
    }

    function paintLine(x1: number, y1: number, x2: number, y2: number) {
      const ctx = canvasRef.current?.getContext('2d')
      if (!ctx) return
      const erasing = toolRef.current === 'eraser'
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2)
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctx.strokeStyle = erasing ? '#FFFFFF' : colorRef.current
      ctx.lineWidth   = erasing ? sizeRef.current * 4 : sizeRef.current
      ctx.stroke()
    }

    function startStroke(cx: number, cy: number) {
      if (submittedRef.current) return
      saveSnap()
      isDrawing.current = true
      lastPt.current    = toCanvasPt(cx, cy)
    }

    function moveStroke(cx: number, cy: number) {
      if (!isDrawing.current || submittedRef.current) return
      const pt   = toCanvasPt(cx, cy)
      const prev = lastPt.current
      if (prev) paintLine(prev.x, prev.y, pt.x, pt.y)
      lastPt.current = pt
    }

    function endStroke() { isDrawing.current = false; lastPt.current = null }

    // ── Mouse handlers ────────────────────────────────────────────────────────
    const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      if (e.button !== 0) return
      startStroke(e.clientX, e.clientY)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing.current) return
      e.preventDefault()
      moveStroke(e.clientX, e.clientY)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const onMouseUp = useCallback(() => endStroke(), [])

    // ── Touch handlers ────────────────────────────────────────────────────────
    const onTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      if (e.touches.length === 1) {
        pinchState.current = null
        startStroke(e.touches[0].clientX, e.touches[0].clientY)
      } else if (e.touches.length === 2) {
        endStroke()
        const [t0, t1] = [e.touches[0], e.touches[1]]
        const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)
        const tf = transform.current
        pinchState.current = { dist, scale: tf.scale, tx: tf.tx, ty: tf.ty, midX: (t0.clientX + t1.clientX) / 2, midY: (t0.clientY + t1.clientY) / 2 }
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const onTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      if (e.touches.length === 1 && !pinchState.current) {
        moveStroke(e.touches[0].clientX, e.touches[0].clientY)
      } else if (e.touches.length === 2 && pinchState.current) {
        const [t0, t1] = [e.touches[0], e.touches[1]]
        const newDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)
        const midX = (t0.clientX + t1.clientX) / 2, midY = (t0.clientY + t1.clientY) / 2
        const p = pinchState.current
        const newScale = Math.min(Math.max(p.scale * (newDist / p.dist), 1), 5)
        const canvas = canvasRef.current
        if (canvas) {
          const rect = canvas.getBoundingClientRect()
          const anchorX = (p.midX - rect.left - p.tx) / p.scale
          const anchorY = (p.midY - rect.top  - p.ty) / p.scale
          const newTx = midX - rect.left - anchorX * newScale
          const newTy = midY - rect.top  - anchorY * newScale
          transform.current = { scale: newScale, tx: newTx, ty: newTy }
          canvas.style.transformOrigin = '0 0'
          canvas.style.transform = `translate(${newTx}px,${newTy}px) scale(${newScale})`
        }
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const onTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      if (e.touches.length < 2) pinchState.current = null
      if (e.touches.length === 0) endStroke()
    }, [])

    // ── Undo / Submit ─────────────────────────────────────────────────────────
    function handleUndo() {
      if (!undoStack.length) return
      const c = canvasRef.current; const ctx = c?.getContext('2d')
      if (!ctx || !c) return
      ctx.putImageData(undoStack[undoStack.length - 1], 0, 0)
      setUndoStack(p => p.slice(0, -1))
    }

    function doSubmit() {
      if (submittedRef.current) return
      submittedRef.current = true
      setSubmitted(true)
      if (timerRef.current) clearInterval(timerRef.current)
      const canvas = canvasRef.current
      if (!canvas) return
      // Reset zoom before export
      canvas.style.transform = ''; transform.current = { scale: 1, tx: 0, ty: 0 }
      onSubmit(canvas.toDataURL('image/png'))
    }

    useImperativeHandle(ref, () => ({ submit: () => canvasRef.current?.toDataURL('image/png') ?? '' }))

    // ── Timer display ─────────────────────────────────────────────────────────
    const radius = 18, circ = 2 * Math.PI * radius
    const pct = totalSecs > 0 ? secsLeft / totalSecs : 0
    const urgent = secsLeft <= 10
    const timeStr = `${Math.floor(secsLeft / 60)}:${(secsLeft % 60).toString().padStart(2, '0')}`

    return (
      <div className="canvas-screen" style={{ userSelect: 'none' }}>

        {/* Prompt overlay — covers canvas only until dismissed */}
        {showOverlay && (
          <div
            onClick={() => { setFadingOverlay(true); setTimeout(() => setShowOverlay(false), 600) }}
            style={{
              position: 'fixed', inset: 0, zIndex: 50,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(44,36,32,0.88)', backdropFilter: 'blur(4px)',
              opacity: fadingOverlay ? 0 : 1, transition: 'opacity 0.6s ease',
              pointerEvents: fadingOverlay ? 'none' : 'auto',
              cursor: 'pointer',
            }}
          >
            <p style={{ color: 'var(--bark)', fontSize: '11px', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: '16px' }}>Today&apos;s prompt</p>
            <h2 style={{ fontFamily: 'var(--font-cormorant,"Cormorant Garamond",serif)', fontSize: 'clamp(24px,6vw,36px)', fontWeight: 300, color: 'var(--cream)', textAlign: 'center', lineHeight: 1.3, maxWidth: '320px', marginBottom: '24px' }}>
              {prompt}
            </h2>
            <p style={{ color: 'var(--bark)', fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.6 }}>tap to start drawing</p>
          </div>
        )}

        {/* HUD */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: 'var(--warm-white)', borderBottom: '1px solid var(--sand)', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-cormorant,"Cormorant Garamond",serif)', fontSize: '18px', fontWeight: 300 }}>SketchClub</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontFamily: 'var(--font-cormorant,"Cormorant Garamond",serif)', fontSize: '24px', fontWeight: 500, color: urgent ? 'var(--urgent)' : 'var(--charcoal)', transition: 'color 0.3s', minWidth: '44px', textAlign: 'right' }}>
              {timeStr}
            </span>
            <svg width="42" height="42" viewBox="0 0 42 42" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
              <circle cx="21" cy="21" r={radius} fill="none" stroke="var(--sand)" strokeWidth="3" />
              <circle cx="21" cy="21" r={radius} fill="none" stroke={urgent ? 'var(--urgent)' : 'var(--clay)'} strokeWidth="3" strokeLinecap="round"
                strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
                style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }} />
            </svg>
          </div>
        </div>

        {/* Prompt strip */}
        <div style={{ background: 'var(--parchment)', borderBottom: '1px solid var(--sand)', padding: '5px 16px', flexShrink: 0, textAlign: 'center' }}>
          <p style={{ fontSize: '12px', color: 'var(--earth)', fontStyle: 'italic' }}>{prompt}</p>
        </div>

        {/* Canvas — fills all remaining space; CSS 100%×100% ensures it always catches events */}
        <div ref={canvasBoxRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0, background: '#fff' }}>
          <canvas
            ref={canvasRef}
            style={{ display: 'block', width: '100%', height: '100%', cursor: tool === 'eraser' ? 'cell' : 'crosshair', touchAction: 'none' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          />
        </div>

        {/* Toolbar — horizontally scrollable, tools left, submit always visible right */}
        <div style={{ flexShrink: 0, background: 'var(--warm-white)', borderTop: '1px solid var(--sand)', display: 'flex', alignItems: 'center', gap: 0 }}>
          {/* Scrollable section */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', padding: '8px 10px', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>

            {/* Pen */}
            <button className={`tool-btn${tool === 'pen' ? ' active' : ''}`} onClick={() => setTool('pen')} title="Pen" style={{ flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
              </svg>
            </button>

            {/* Eraser */}
            <button className={`tool-btn${tool === 'eraser' ? ' active' : ''}`} onClick={() => setTool('eraser')} title="Eraser" style={{ flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 20H7L3 16l10-10 7 7-4.5 4.5"/><path d="M6.5 17.5l3-3"/>
              </svg>
            </button>

            {/* Undo */}
            <button className="tool-btn" onClick={handleUndo} disabled={undoStack.length === 0} title="Undo" style={{ flexShrink: 0, opacity: undoStack.length === 0 ? 0.35 : 1 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
              </svg>
            </button>

            {/* Brush size */}
            <input type="range" min={1} max={24} value={brushSize} onChange={e => setBrushSize(Number(e.target.value))}
              style={{ width: '64px', cursor: 'pointer', flexShrink: 0, accentColor: 'var(--clay)' }} />

            {/* Divider */}
            <div style={{ width: '1px', height: '22px', background: 'var(--sand)', flexShrink: 0, margin: '0 2px' }} />

            {/* Colors */}
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => { setColor(c); setTool('pen') }}
                title={c}
                style={{
                  flexShrink: 0,
                  width: '26px', height: '26px', borderRadius: '50%',
                  background: c,
                  border: color === c && tool === 'pen' ? '3px solid var(--charcoal)' : c === '#FFFFFF' ? '2px solid var(--sand)' : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'transform 0.1s',
                  transform: color === c && tool === 'pen' ? 'scale(1.2)' : 'scale(1)',
                }}
              />
            ))}
          </div>

          {/* Submit — always visible, never scrolled away */}
          <div style={{ flexShrink: 0, padding: '8px 10px', borderLeft: '1px solid var(--sand)' }}>
            <button
              onClick={doSubmit}
              disabled={submitted}
              style={{
                background: submitted ? 'var(--sage)' : 'var(--charcoal)',
                color: 'var(--cream)',
                border: 'none', borderRadius: '4px',
                padding: '8px 14px', fontSize: '12px', fontWeight: 500,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                cursor: submitted ? 'default' : 'pointer',
                fontFamily: 'inherit', whiteSpace: 'nowrap',
                transition: 'background 0.2s',
              }}
            >
              {submitted ? 'Done' : 'Submit'}
            </button>
          </div>
        </div>
      </div>
    )
  }
)
