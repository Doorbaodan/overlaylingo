import { useRef } from 'react'

interface DragState {
  sx: number
  sy: number
  ox: number
  oy: number
  moved: boolean
}

/** 悬浮球：无文字、浅灰、低不透明度；可拖动（位置仅受拖动影响），点击展开弹窗 */
export default function Bubble() {
  const dragRef = useRef<DragState | null>(null)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { sx: e.screenX, sy: e.screenY, ox: e.clientX, oy: e.clientY, moved: false }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = dragRef.current
    if (!d) return
    const dx = e.screenX - d.sx
    const dy = e.screenY - d.sy
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
    if (d.moved) window.api.overlay.move(e.screenX - d.ox, e.screenY - d.oy)
  }

  const onPointerUp = (): void => {
    const d = dragRef.current
    dragRef.current = null
    if (d && !d.moved) window.api.overlay.expand()
  }

  return (
    <div
      className="bubble"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  )
}
