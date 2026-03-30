#!/usr/bin/env node
/**
 * 將 icons 底下主畫面／PWA 圖示的透明像素填成與圖案邊緣相近的底色，避免 iOS 把透明當成白邊。
 * 外圈若全透明（常見於圓角匯出），改從「鄰近透明的不透明像素」或整張圖不透明像素取平均。
 */
import sharp from 'sharp'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

/**
 * @param {Buffer} buf
 * @returns {{ r: number, g: number, b: number }}
 */
async function pickFlattenBackground (buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const w = info.width
  const h = info.height
  const ch = info.channels

  const add = (sr, sg, sb, n, r, g, b) => {
    sr += r
    sg += g
    sb += b
    return { sr, sg, sb, n: n + 1 }
  }

  const toRgb = (sr, sg, sb, n) => ({
    r: Math.round(sr / n),
    g: Math.round(sg / n),
    b: Math.round(sb / n)
  })

  // 1) 外圈 14% 帶狀、且 alpha 夠高（舊邏輯）
  const margin = Math.round(Math.min(w, h) * 0.14)
  let sr = 0
  let sg = 0
  let sb = 0
  let n = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x < margin || x >= w - margin || y < margin || y >= h - margin
      if (!edge) continue
      const i = (y * w + x) * ch
      if (data[i + 3] < 200) continue
      ;({ sr, sg, sb, n } = add(sr, sg, sb, n, data[i], data[i + 1], data[i + 2]))
    }
  }
  if (n > 0) return toRgb(sr, sg, sb, n)

  // 2) 不透明像素且四鄰有透明（圓角外圈全透明時）
  sr = 0
  sg = 0
  sb = 0
  n = 0
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
      if (nearTrans) {
        ;({ sr, sg, sb, n } = add(sr, sg, sb, n, data[i], data[i + 1], data[i + 2]))
      }
    }
  }
  if (n > 0) return toRgb(sr, sg, sb, n)

  // 3) 整張凡 alpha 夠高者平均
  sr = 0
  sg = 0
  sb = 0
  n = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch
      if (data[i + 3] < 200) continue
      ;({ sr, sg, sb, n } = add(sr, sg, sb, n, data[i], data[i + 1], data[i + 2]))
    }
  }
  if (n > 0) return toRgb(sr, sg, sb, n)

  return { r: 15, g: 118, b: 110 }
}

async function flattenIcon (relativePath) {
  const path = join(root, relativePath)
  const buf = readFileSync(path)
  const bg = await pickFlattenBackground(buf)
  await sharp(buf).flatten({ background: bg }).png().toFile(path)
  console.log(relativePath, 'flatten', `rgb(${bg.r},${bg.g},${bg.b})`)
}

await flattenIcon('icons/apple-touch-icon.png')
await flattenIcon('icons/icon-512.png')
