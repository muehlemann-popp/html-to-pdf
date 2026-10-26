#!/usr/bin/env node
// Compares the reference outputs of two scripts/benchmark.mjs runs.
//
//   node scripts/compare-references.mjs <old-out-dir> <new-out-dir>
//
// For PDFs: page count, page size and the share of differing pixels on the first, middle and
// last page (rendered with poppler's pdftoppm at 50 dpi, grayscale). For PNGs: dimensions.
// Needs poppler (`brew install poppler`, `apk add poppler-utils`).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [oldDir, newDir] = process.argv.slice(2)
if (!oldDir || !newDir) {
  console.error('usage: node scripts/compare-references.mjs <old-out-dir> <new-out-dir>')
  process.exit(2)
}

const pdfInfo = (file) => {
  const out = execFileSync('pdfinfo', [file], { encoding: 'utf8' })
  return {
    pages: Number(out.match(/^Pages:\s+(\d+)/m)[1]),
    size: out.match(/^Page size:\s+(.+)$/m)[1].trim(),
  }
}

// binary PGM (P5) as written by pdftoppm -gray
const readPgm = (file) => {
  const buf = readFileSync(file)
  const [header, w, h] = buf.toString('latin1', 0, 64).match(/^P5\s+(\d+)\s+(\d+)\s+\d+\s/)
  return { w: Number(w), h: Number(h), pixels: buf.subarray(header.length) }
}

const renderPage = (file, page, dir, prefix) => {
  execFileSync('pdftoppm', ['-gray', '-r', '50', '-f', String(page), '-l', String(page), '-singlefile', file,
    join(dir, prefix)])
  return readPgm(join(dir, `${prefix}.pgm`))
}

const diffShare = (a, b) => {
  const w = Math.min(a.w, b.w)
  const h = Math.min(a.h, b.h)
  let differing = 0
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (Math.abs(a.pixels[y * a.w + x] - b.pixels[y * b.w + x]) > 32) differing += 1
    }
  }
  // area that exists in only one of the two renders counts as different
  differing += a.w * a.h + b.w * b.h - 2 * w * h
  return differing / Math.max(a.w * a.h, b.w * b.h)
}

const pngSize = (file) => {
  const buf = readFileSync(file)
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`
}

const tmp = mkdtempSync(join(tmpdir(), 'html-to-pdf-compare-'))
try {
  const files = readdirSync(oldDir).filter((f) => /\.(pdf|png)$/.test(f))
  const rows = files.map((f) => {
    const [a, b] = [join(oldDir, f), join(newDir, f)]
    try {
      readFileSync(b)
    } catch {
      return { file: f, result: 'missing in new' }
    }
    if (f.endsWith('.png')) return { file: f, old: pngSize(a), new: pngSize(b) }
    const [ia, ib] = [pdfInfo(a), pdfInfo(b)]
    const pages = [...new Set([1, Math.ceil(Math.min(ia.pages, ib.pages) / 2), Math.min(ia.pages, ib.pages)])]
    const diffs = pages.map((p) => {
      const share = diffShare(renderPage(a, p, tmp, `a${p}`), renderPage(b, p, tmp, `b${p}`))
      return `p${p} ${(share * 100).toFixed(1)}%`
    })
    return {
      file: f, old: `${ia.pages}p ${ia.size}`, new: `${ib.pages}p ${ib.size}`, pixelsDiffering: diffs.join(', '),
    }
  })
  console.table(rows)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
