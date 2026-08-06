import { chromium } from "playwright"

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 500 } })
await page.goto("http://127.0.0.1:7815")
await page.fill("#password", "qa-password-123")
await page.click("button[type=submit]")
await page.waitForSelector(".terminal canvas", { timeout: 15000 })
await page.waitForTimeout(1500)
const r = await page.evaluate(() => {
  // measure the glyph directly against each candidate font
  const c = document.createElement("canvas")
  const ctx = c.getContext("2d")
  const glyph = "\ue0a0"
  const out = {}
  for (const f of [
    '"SymbolsNerdFontMono"',
    '"JetBrains Mono", "SymbolsNerdFontMono", monospace',
    "monospace",
  ]) {
    ctx.font = `16px ${f}`
    const m = ctx.measureText(glyph)
    out[f] = { width: m.width, hasGlyph: m.width > 0 }
  }
  // is the face actually usable for this codepoint?
  out.checkPUA = document.fonts.check('16px "SymbolsNerdFontMono"', "\ue0a0")
  out.checkPUA2 = document.fonts.check('16px "SymbolsNerdFontMono"', "\uf07b")
  return out
})
console.log(JSON.stringify(r, null, 1))
await browser.close()
