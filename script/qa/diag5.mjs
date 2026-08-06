import { chromium } from "playwright"

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto("http://127.0.0.1:7809")
await page.fill("#password", "qa-password-123")
await page.click("button[type=submit]")
await page.waitForSelector(".terminal canvas", { timeout: 15000 })
await page.waitForTimeout(1200)
const theme = await page.evaluate(() => {
  const t = globalThis.__wt.terminal
  return {
    bg: t.options.theme.background,
    fg: t.options.theme.foreground,
    font: t.options.fontFamily,
    size: t.options.fontSize,
    cursor: t.options.cursorStyle,
    blink: t.options.cursorBlink,
  }
})
console.log(JSON.stringify(theme))
await browser.close()
