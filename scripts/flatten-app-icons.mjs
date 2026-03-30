#!/usr/bin/env node
/**
 * 將 icons 底下主畫面／PWA 圖示的透明像素填成外框平均色，避免 iOS 把透明當成白邊。
 * 換新圖後可執行：npx sharp 已安裝時 → node scripts/flatten-app-icons.mjs
 */
import sharp from 'sharp'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

async function opaqueEdgeAverage (buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const w = info.width
  const h = info.height
  const ch = info.channels
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
      sr += data[i]
      sg += data[i + 1]
      sb += data[i + 2]
      n++
    }
  }
  return { r: Math.round(sr / n), g: Math.round(sg / n), b: Math.round(sb / n) }
}

async function flattenIcon (relativePath) {
  const path = join(root, relativePath)
  const buf = readFileSync(path)
  const bg = await opaqueEdgeAverage(buf)
  await sharp(buf).flatten({ background: bg }).png().toFile(path)
  console.log(relativePath, 'flatten', `rgb(${bg.r},${bg.g},${bg.b})`)
}

await flattenIcon('icons/apple-touch-icon.png')
await flattenIcon('icons/icon-512.png')
