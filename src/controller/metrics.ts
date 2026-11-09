import {
  Counter, Gauge, Histogram, collectDefaultMetrics,
} from 'prom-client'
import { captureSlots } from '~/controller/capture-slots'

// names and labels are what dashboards query, see README "GET /metrics": rename nothing

export const pdfCounter = new Counter({
  name: 'pdf_counter',
  help: 'Amount of PDFs generates',
  labelNames: ['method'],
})

export const screenshotCounter = new Counter({
  name: 'screenshot_counter',
  help: 'Amount of screenshots generates',
  labelNames: ['method'],
})

export type CaptureOutcome = 'ok' | 'target_error' | 'service_error' | 'rejected'

export const captureDuration = new Histogram({
  name: 'capture_duration_seconds',
  help: 'Time from receiving a /pdf or /screenshot request to its answer: queue, capture and retry',
  labelNames: ['type', 'outcome'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120],
})

// gauges read when scraped
export const capturesInProgress = new Gauge({
  name: 'captures_in_progress',
  help: 'Captures holding a slot (MAX_CONCURRENT_CAPTURES) right now; /selfcheck takes none',
  collect() {
    this.set(captureSlots.active)
  },
})

export const capturesQueued = new Gauge({
  name: 'captures_queued',
  help: 'Captures waiting for a free slot (MAX_QUEUED_CAPTURES) right now',
  collect() {
    this.set(captureSlots.queued)
  },
})

export const browserLaunches = new Counter({
  name: 'browser_launches_total',
  help: 'Chromium launches of the shared browser, by result',
  labelNames: ['result'],
})

export type RetireReason = 'max_captures' | 'idle' | 'failure' | 'disconnect' | 'launch_failure'

export const browserRetirements = new Counter({
  name: 'browser_retirements_total',
  help: 'Shared browsers taken out of service, by reason',
  labelNames: ['reason'],
})

collectDefaultMetrics()
