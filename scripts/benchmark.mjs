#!/usr/bin/env node
// Memory and latency benchmark for an html-to-pdf docker image.
//
//   node scripts/benchmark.mjs <image> <out-dir> [--memory=1g] [--rounds=N] [--scenarios=simple,parallel8]
//                              [--env=NAME=value ...]
//
// --memory sets a container limit: page cache gets reclaimed under it, so the lowest limit at which
// no request fails is the real memory requirement, while memory.peak without a limit includes cache.
// Every scenario runs in a fresh container, so the cgroup's memory.peak is the peak of
// that scenario alone (including container start). The first response of every fixture
// in test/reference/requests/ is saved to <out-dir> for visual comparison between images.
// No dependencies: needs node >= 18 and docker.
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [image, outDirArg, ...flags] = process.argv.slice(2)
if (!image || !outDirArg) {
  console.error('usage: node scripts/benchmark.mjs <image> <out-dir> [--memory=1g] [--rounds=N] [--env=NAME=value ...]')
  process.exit(2)
}
const option = (name, fallback) => flags.find((f) => f.startsWith(`--${name}=`))?.split('=')[1] ?? fallback
const memoryLimit = option('memory', '')
const rounds = Number(option('rounds', '10'))
const env = flags.filter((f) => f.startsWith('--env=')).map((f) => f.slice('--env='.length))
const only = option('scenarios', '').split(',').filter(Boolean)
const outDir = resolve(outDirArg)
mkdirSync(outDir, { recursive: true })

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'reference', 'requests')
const fixtures = Object.fromEntries(readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(fixturesDir, f), 'utf8'))]))

const MiB = 1024 * 1024
const port = 14000 + Math.floor(Math.random() * 1000)
const base = `http://127.0.0.1:${port}`
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim()
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms) })

const saved = new Set()
const request = async (name, method = 'POST') => {
  const { endpoint, body } = fixtures[name] ?? { endpoint: name }
  const started = performance.now()
  let res
  let bytes
  try {
    res = await fetch(`${base}${endpoint}`, method === 'GET'
      ? {}
      : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    bytes = Buffer.from(await res.arrayBuffer())
  } catch (e) {
    // the service exits after two failed captures in a row, see src/util/capture-return.ts
    return { ok: false, status: 0, ms: performance.now() - started, bytes: 0, error: e.message }
  }
  const ms = performance.now() - started
  if (res.ok && fixtures[name] && !saved.has(name)) {
    saved.add(name)
    writeFileSync(join(outDir, `${name}.${endpoint === '/pdf' ? 'pdf' : 'png'}`), bytes)
  }
  return { ok: res.ok, status: res.status, ms, bytes: bytes.length }
}

const scenarios = {
  idle: async () => [],
  selfcheck: async () => { const r = []; for (let i = 0; i < rounds; i += 1) r.push(await request('/selfcheck', 'GET')); return r },
  simple: async () => { const r = []; for (let i = 0; i < rounds; i += 1) r.push(await request('simple')); return r },
  rich: async () => { const r = []; for (let i = 0; i < rounds; i += 1) r.push(await request('rich')); return r },
  long: async () => { const r = []; for (let i = 0; i < Math.ceil(rounds / 2); i += 1) r.push(await request('long')); return r },
  screenshot: async () => { const r = []; for (let i = 0; i < rounds; i += 1) r.push(await request('screenshot')); return r },
  // the service launches one browser per request, so this is 8 browsers at once
  parallel8: async () => {
    const r = []
    for (let i = 0; i < 3; i += 1) r.push(...await Promise.all(Array.from({ length: 8 }, () => request('simple'))))
    return r
  },
}

const readMemory = (name) => {
  const out = docker('exec', name, 'cat', '/sys/fs/cgroup/memory.current', '/sys/fs/cgroup/memory.peak')
  const [current, peak] = out.split('\n').map(Number)
  return { current, peak }
}

// samples anon (non-reclaimable) memory every ~50ms; memory.peak also counts page cache
const sampleAnon = (name) => {
  const samples = []
  const proc = spawn('docker', ['exec', name, 'sh', '-c',
    'while :; do grep "^anon " /sys/fs/cgroup/memory.stat; sleep 0.05; done'])
  proc.stdout.on('data', (d) => d.toString().split('\n').forEach((l) => {
    const v = Number(l.split(' ')[1]); if (v) samples.push(v)
  }))
  return () => { proc.kill(); return samples.length ? Math.max(...samples) : 0 }
}

const run = async (scenario) => {
  const name = `html-to-pdf-bench-${process.pid}-${scenario}`
  docker('run', '-d', '--rm', '--name', name, '-p', `127.0.0.1:${port}:4000`,
    ...(memoryLimit ? ['--memory', memoryLimit] : []), ...env.flatMap((e) => ['--env', e]), image)
  try {
    for (let i = 0; ; i += 1) {
      try { if ((await fetch(`${base}/health`)).ok) break } catch { /* not up yet */ }
      if (i > 100) throw new Error(`${image} did not become healthy`)
      await sleep(200)
    }
    const idle = readMemory(name)
    const stopSampling = sampleAnon(name)
    const results = await scenarios[scenario]()
    await sleep(1000)
    const anonPeak = stopSampling()
    const after = readMemory(name)
    const processes = docker('exec', name, 'ps', '-o', 'comm').split('\n').filter((p) => /chrom/i.test(p)).length
    const times = results.map((r) => r.ms).sort((a, b) => a - b)
    return {
      scenario,
      requests: results.length,
      failed: results.filter((r) => !r.ok).length,
      idleMiB: Math.round(idle.current / MiB),
      peakMiB: Math.round(after.peak / MiB),
      anonPeakMiB: Math.round(anonPeak / MiB),
      afterMiB: Math.round(after.current / MiB),
      leftoverChromeProcesses: processes,
      medianMs: times.length ? Math.round(times[Math.floor(times.length / 2)]) : null,
      maxMs: times.length ? Math.round(times[times.length - 1]) : null,
    }
  } finally {
    writeFileSync(join(outDir, `${scenario}.log`), execFileSync('sh', ['-c', `docker logs ${name} 2>&1`]))
    docker('rm', '-f', name)
  }
}

const versions = docker('run', '--rm', '--entrypoint', 'sh', image, '-c',
  'echo "alpine $(cat /etc/alpine-release)"; echo "node $(node -v)"; "${PUPPETEER_EXECUTABLE_PATH:-chromium-browser}" --version')
console.log(`${image}\n${versions}`)
const report = []
for (const scenario of Object.keys(scenarios).filter((s) => !only.length || only.includes(s))) {
  const r = await run(scenario)
  console.log(JSON.stringify(r))
  report.push(r)
}
writeFileSync(join(outDir, 'report.json'), JSON.stringify({
  image, versions, env, memoryLimit, rounds, report,
}, null, 2))
console.table(report)
