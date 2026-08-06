import { chromium } from "playwright"

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 500 } })
await page.goto("http://127.0.0.1:7815")
await page.fill("#password", "qa-password-123")
await page.click("button[type=submit]")
await page.waitForSelector(".terminal canvas", { timeout: 15000 })
await page.waitForTimeout(1500)
const r = await page.evaluate(() => {
  const stack = '"JetBrains Mono", "SymbolsNerdFontMono", ui-monospace, Menlo, monospace'
  const glyph = "\ue0a0"
  const inkPixels = (font) => {
    const c = document.createElement("canvas")
    c.width = 40
    c.height = 40
    const ctx = c.getContext("2d")
    ctx.fillStyle = "#fff"
    ctx.font = `24px ${font}`
    ctx.textBaseline = "middle"
    ctx.fillText(glyph, 4, 20)
    const data = ctx.getImageData(0, 0, 40, 40).data
    let ink = 0
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) ink++
    return ink
  }
  return {
    withStack: inkPixels(stack),
    withNerdOnly: inkPixels('"SymbolsNerdFontMono"'),
    withMono: inkPixels("monospace"),
    check: document.fonts.check('24px "SymbolsNerdFontMono"', glyph),
  }
})
console.log(JSON.stringify(r))
await browser.close()
