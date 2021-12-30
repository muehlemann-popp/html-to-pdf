import { Counter, collectDefaultMetrics } from 'prom-client'

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

collectDefaultMetrics()
