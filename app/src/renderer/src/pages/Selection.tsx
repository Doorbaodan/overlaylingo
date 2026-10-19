import { useEffect, useRef, useState } from 'react'

interface Draft {
  x: number
  y: number
  w: number
  h: number
}

export default function Selection() {
  /** 已有捕获区域（窗口内坐标） */
  const [currentRoi, setCurrentRoi] = useState<Draft | null>(null)
  /** 正在拖拽的新区域 */
  const [draft, setDraft] = useState<Draft | null>(null)
  const [background, setBackground] = useState('')
  const offsetRef = useRef({ x: 0, y: 0 })
  const startRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    window.api.selection.getInit().then(({ offset, currentRoi, background }) => {
      offsetRef.current = offset
      if (background) setBackground(background)
      if (currentRoi) {
        setCurrentRoi({
          x: currentRoi.x - offset.x,
          y: currentRoi.y - offset.y,
          w: currentRoi.width,
          h: currentRoi.height
        })
      }
    })
  }, [])

  const onMouseDown = (e: React.MouseEvent): void => {
    startRef.current = { x: e.clientX, y: e.clientY }
    setDraft({ x: e.clientX, y: e.clientY, w: 0, h: 0 })
  }

  const onMouseMove = (e: React.MouseEvent): void => {
    if (!startRef.current) return
    const s = startRef.current
    setDraft({
      x: Math.min(s.x, e.clientX),
      y: Math.min(s.y, e.clientY),
      w: Math.abs(e.clientX - s.x),
      h: Math.abs(e.clientY - s.y)
    })
  }

  const onMouseUp = (): void => {
    startRef.current = null
  }

  const confirm = (): void => {
    // 优先使用新拖拽的区域，否则保留已有区域
    const r = draft && draft.w > 8 && draft.h > 8 ? draft : currentRoi
    if (r) {
      window.api.selection.confirm({
        x: r.x + offsetRef.current.x,
        y: r.y + offsetRef.current.y,
        width: r.w,
        height: r.h
      })
    } else {
      window.api.selection.cancel()
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.api.selection.cancel()
      if (e.key === 'Enter') confirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div
      className="selection-root"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      {background && <img className="selection-bg" src={background} alt="" draggable={false} />}

      {currentRoi && !draft && (
        <div
          className="selection-rect existing"
          style={{ left: currentRoi.x, top: currentRoi.y, width: currentRoi.w, height: currentRoi.h }}
        >
          <span className="selection-size">当前区域 · 拖拽可重选</span>
        </div>
      )}

      {draft && draft.w > 0 && draft.h > 0 && (
        <div
          className="selection-rect"
          style={{ left: draft.x, top: draft.y, width: draft.w, height: draft.h }}
        >
          <span className="selection-size">
            {Math.round(draft.w)} × {Math.round(draft.h)}
          </span>
        </div>
      )}

      <div className="selection-toolbar" onMouseDown={(e) => e.stopPropagation()}>
        <span className="selection-tip">拖拽框选字幕区域，Enter 确认 · Esc 取消</span>
        <div className="selection-btns">
          <button className="btn" onClick={confirm}>
            确认
          </button>
          <button className="btn ghost" onClick={() => window.api.selection.cancel()}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
