// The page `GET /` serves: README.md rendered to HTML with a small inline stylesheet. Rendered at build
// time (scripts/build.mjs, vitest.config.mts) into the global README_HTML, so the service needs neither
// marked nor README.md at runtime, and the page loads nothing from elsewhere.
import { readFileSync } from 'node:fs'
import { marked } from 'marked'

// light or dark, following the reader's system setting
const css = `
:root { color-scheme: light dark; --fg: #1f2328; --muted: #59636e; --bg: #fff; --subtle: #f6f8fa;
  --border: #d1d9e0; --link: #0969da; }
@media (prefers-color-scheme: dark) { :root { --fg: #e6edf3; --muted: #9198a1; --bg: #0d1117;
  --subtle: #151b23; --border: #3d444d; --link: #4493f8; } }
body { margin: 0; background: var(--bg); color: var(--fg);
  font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 52rem; margin: 0 auto; padding: 2rem 1rem 4rem; }
h1, h2, h3 { line-height: 1.25; margin: 2rem 0 1rem; }
h1, h2 { padding-bottom: .3em; border-bottom: 1px solid var(--border); }
a[href] { color: var(--link); }
code, pre { font: .875em/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: var(--subtle); border-radius: 6px; }
code { padding: .15em .35em; }
pre { padding: 1rem; overflow-x: auto; }
pre code { padding: 0; background: none; font-size: 1em; }
table { border-collapse: collapse; display: block; overflow-x: auto; margin: 1rem 0; }
th, td { border: 1px solid var(--border); padding: .4rem .75rem; text-align: left; vertical-align: top; }
th { background: var(--subtle); }
blockquote { margin: 1rem 0; padding: 0 1rem; color: var(--muted); border-left: .25em solid var(--border); }
img { max-width: 100%; }
`.replace(/\s*\n\s*/g, ' ').trim()

export const readmeHtml = () => {
  const content = marked.parse(readFileSync('README.md', 'utf8'), { async: false })
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1"><title>html-to-pdf</title>'
    + `<style>${css}</style></head><body><main>${content}</main></body></html>`
}
