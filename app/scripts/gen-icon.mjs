// 生成应用图标（icon.png 256x256）与托盘图标（tray.png 32x32）
// 无第三方依赖，纯 Node zlib 手写 PNG 编码
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'resources')

// ---- CRC32 ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff]
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePng(width, height, rgba) {
  const stride = width * 4 + 1
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0 // filter: none
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// teal 圆底 + 两条白色「字幕条」
function makeIcon(size) {
  const buf = Buffer.alloc(size * size * 4)
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.46
  const x0 = size * 0.26
  const x1 = size * 0.74
  const l1 = [size * 0.34, size * 0.44]
  const l2 = [size * 0.56, size * 0.66]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy)
      let a = 0
      if (d <= r - 0.5) a = 1
      else if (d <= r + 0.5) a = r + 0.5 - d
      a = Math.max(0, Math.min(1, a))

      const inLine1 = y >= l1[0] && y <= l1[1] && x >= x0 && x <= x1
      const inLine2 = y >= l2[0] && y <= l2[1] && x >= x0 && x <= x1
      const white = inLine1 || inLine2

      const off = (y * size + x) * 4
      buf[off] = white ? 255 : 29
      buf[off + 1] = white ? 255 : 158
      buf[off + 2] = white ? 255 : 117
      buf[off + 3] = Math.round(a * 255)
    }
  }
  return buf
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'icon.png'), encodePng(256, 256, makeIcon(256)))
fs.writeFileSync(path.join(OUT, 'tray.png'), encodePng(32, 32, makeIcon(32)))
console.log('icons generated at', OUT)
