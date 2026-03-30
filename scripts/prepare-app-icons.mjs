#!/usr/bin/env node
/**
 * 處理主畫面／PWA 圖示：
 * 1) 裁掉四周白／近白留白（方形圖檔但內容較小時）
 * 2) 縮放為目標正方形
 * 3) 將透明圓角等區域填色（避免 iOS 白邊／黑邊）
 *
 * 換新圖後：npm run icons:prepare
 */
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

/** @param {Buffer} buf */
async function pickFlattenBackground (buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const w = info.width
  const h = info.height
  const ch = info.channels

  const toRgb = (sr, sg, sb, n) => ({
    r: Math.round(sr / n),
    g: Math.round(sg / n),
    b: Math.round(sb / n)
  })

  const add = (o, r, g, b) => {
    o.sr += r
    o.sg += g
    o.sb += b
    o.n++
    return o
  }

  const margin = Math.round(Math.min(w, h) * 0.14)
  let o = { sr: 0, sg: 0, sb: 0, n: 0 }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x < margin || x >= w - margin || y < margin || y >= h - margin
      if (!edge) continue
      const i = (y * w + x) * ch
      if (data[i + 3] < 200) continue
      o = add(o, data[i], data[i + 1], data[i + 2])
    }
  }
  if (o.n > 0) return toRgb(o.sr, o.sg, o.sb, o.n)

  o = { sr: 0, sg: 0, sb: 0, n: 0 }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch
      if (data[i + 3] < 128) continue
      let nearTrans = false
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
          nearTrans = true
          break
        }
        const j = (ny * w + nx) * ch
        if (data[j + 3] < 128) nearTrans = true
      }
      if (nearTrans) o = add(o, data[i], data[i + 1], data[i + 2])
    }
  }
  if (o.n > 0) return toRgb(o.sr, o.sg, o.sb, o.n)

  o = { sr: 0, sg: 0, sb: 0, n: 0 }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch
      if (data[i + 3] < 200) continue
      o = add(o, data[i], data[i + 1], data[i + 2])
    }
  }
  if (o.n > 0) return toRgb(o.sr, o.sg, o.sb, o.n)

  return { r: 15, g: 118, b: 110 }
}

/**
 * 修復「外圈整片近黑」的錯誤匯出：用內容外框周圍 1px 的平均色填滿外側。
 * @param {Buffer} buf
 */
async function repairOuterBlackMargins (buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const w = info.width
  const h = info.height
  const ch = info.channels
  const minSum = 88

  let minX = w
  let minY = h
  let maxX = 0
  let maxY = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch
      if (data[i] + data[i + 1] + data[i + 2] < minSum) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  if (minX >= maxX || minY >= maxY) return buf

  const area = (maxX - minX + 1) * (maxY - minY + 1)
  if (area > w * h * 0.92) return buf

  let sr = 0
  let sg = 0
  let sb = 0
  let n = 0
  for (let y = minY; y <= maxY; y++) {
    for (const x of [minX, maxX]) {
      const i = (y * w + x) * ch
      sr += data[i]
      sg += data[i + 1]
      sb += data[i + 2]
      n++
    }
  }
  for (let x = minX; x <= maxX; x++) {
    for (const y of [minY, maxY]) {
      const i = (y * w + x) * ch
      sr += data[i]
      sg += data[i + 1]
      sb += data[i + 2]
      n++
    }
  }
  const fr = Math.round(sr / n)
  const fg = Math.round(sg / n)
  const fb = Math.round(sb / n)

  const out = Buffer.from(data)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) continue
      const i = (y * w + x) * ch
      out[i] = fr
      out[i + 1] = fg
      out[i + 2] = fb
      out[i + 3] = 255
    }
  }
  return await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer()
}

async function processIcon (relativePath, outSize) {
  const path = join(root, relativePath)
  let buf = readFileSync(path)

  buf = await sharp(buf)
    .trim({ background: { r: 255, g: 255, b: 255 }, threshold: 14 })
    .toBuffer()

  buf = await sharp(buf)
    .resize(outSize, outSize, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer()

  buf = await repairOuterBlackMargins(buf)

  const bg = await pickFlattenBackground(buf)
  buf = await sharp(buf).flatten({ background: bg }).png().toBuffer()

  writeFileSync(path, buf)
  console.log(relativePath, '→', outSize, 'flatten', `rgb(${bg.r},${bg.g},${bg.b})`)
}

await processIcon('icons/apple-touch-icon.png', 180)
await processIcon('icons/icon-512.png', 512)
