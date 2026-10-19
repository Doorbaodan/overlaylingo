import { useEffect, useRef, useState } from 'react'

export default function Capture() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const prevSigRef = useRef<Uint8ClampedArray | null>(null)
  const accumSigRef = useRef<Uint8ClampedArray | null>(null)
  const [status, setStatus] = useState('初始化…')
  const [frames, setFrames] = useState(0)
  const [changed, setChanged] = useState(0)

  useEffect(() => {
    let timer: number | null = null
    let running = true
    let frameTotal = 0
    let changedTotal = 0

    async function init(): Promise<void> {
      try {
        const info = await window.api.capture.getInit()
        if (!info.roiLocal) {
          setStatus('未设置捕获区域，请先在悬浮窗「查看捕获区域」框选')
          return
        }

        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
        const video = videoRef.current!
        video.srcObject = stream
        await video.play()

        // DPI 缩放换算：video 为物理像素，ROI 为逻辑坐标
        const scaleX = video.videoWidth / info.displayWidth
        const scaleY = video.videoHeight / info.displayHeight
        const sx = info.roiLocal.x * scaleX
        const sy = info.roiLocal.y * scaleY
        const sw = info.roiLocal.width * scaleX
        const sh = info.roiLocal.height * scaleY

        const canvas = canvasRef.current!
        canvas.width = Math.max(1, Math.round(sw))
        canvas.height = Math.max(1, Math.round(sh))
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!

        setStatus(`捕获中 ${video.videoWidth}×${video.videoHeight}`)

        // 稳定采样：字幕内容稳定（连续两次采样相同）才累积，避免逐词/渐入字幕的中间态被截取
        // 250ms 间隔：覆盖视觉小说快进（每句停留 ≥250ms）等快速文本场景
        timer = window.setInterval(() => {
          if (!running || video.readyState < 2) return
          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
          frameTotal++

          const sig = graySignature(ctx, canvas.width, canvas.height)
          const prev = prevSigRef.current
          const accum = accumSigRef.current
          const stable = prev != null && diffRatio(sig, prev) <= 0.01
          if (stable && (accum == null || diffRatio(sig, accum) > 0.01)) {
            accumSigRef.current = sig
            sendFrame(canvas)
            changedTotal++
          }
          prevSigRef.current = sig

          setFrames(frameTotal)
          setChanged(changedTotal)
        }, 250)
      } catch (err) {
        setStatus('启动失败: ' + (err instanceof Error ? err.message : String(err)))
      }
    }

    function graySignature(ctx: CanvasRenderingContext2D, w: number, h: number): Uint8ClampedArray {
      const sw = 64
      const sh = Math.max(1, Math.round((h / w) * 64))
      const tmp = document.createElement('canvas')
      tmp.width = sw
      tmp.height = sh
      const tc = tmp.getContext('2d', { willReadFrequently: true })!
      tc.drawImage(ctx.canvas, 0, 0, w, h, 0, 0, sw, sh)
      const data = tc.getImageData(0, 0, sw, sh).data
      const gray = new Uint8ClampedArray(sw * sh)
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        gray[j] = (data[i] + data[i + 1] + data[i + 2]) / 3
      }
      return gray
    }

    function diffRatio(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
      if (a.length !== b.length) return 1
      let diff = 0
      for (let i = 0; i < a.length; i++) {
        if (Math.abs(a[i] - b[i]) > 12) diff++
      }
      return diff / a.length
    }

    function sendFrame(canvas: HTMLCanvasElement): void {
      canvas.toBlob((blob) => {
        if (!blob) return
        const reader = new FileReader()
        reader.onload = (): void => {
          window.api.capture.sendFrame(reader.result as ArrayBuffer)
        }
        reader.readAsArrayBuffer(blob)
      }, 'image/jpeg', 0.7)
    }

    init()
    return (): void => {
      running = false
      if (timer) clearInterval(timer)
    }
  }, [])

  return (
    <div className="capture-page">
      <div className="capture-head">
        <span className="capture-title">捕获预览</span>
        <span className="capture-stats">
          {status} · 帧 {frames} · 累积 {changed}
        </span>
      </div>
      <div className="capture-body">
        <video ref={videoRef} style={{ display: 'none' }} />
        <canvas ref={canvasRef} className="capture-canvas" />
      </div>
    </div>
  )
}
