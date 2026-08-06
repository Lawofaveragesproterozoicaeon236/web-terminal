import { chromium } from "playwright"

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto("http://127.0.0.1:7815")
await page.fill("#password", "qa-password-123")
await page.click("button[type=submit]")
await page.waitForSelector(".terminal canvas", { timeout: 15000 })
await page.waitForTimeout(1500)
await page.click(".terminal")
await page.keyboard.type("printf '\\e[?1000h\\e[?1006h\\e[?1003h'; cat -v")
await page.keyboard.press("Enter")
await page.waitForTimeout(1200)
const box = await page.locator(".terminal canvas").boundingBox()
await page.mouse.click(box.x + 200, box.y + 150)
await page.waitForTimeout(800)
const tail = await page.evaluate(() => {
  const b = globalThis.__wt.terminal.buffer.active
  const lines = []
  for (let y = 0; y < b.length; y++) {
    const s = b.getLine(y)?.translateToString(true)
    if (s?.trim()) lines.push(s.trim())
  }
  return lines.slice(-3).join(" | ")
})
console.log("tail:", JSON.stringify(tail))
console.log(
  "hasMouseTracking:",
  await page.evaluate(() => globalThis.__wt.terminal.hasMouseTracking?.()),
)
await browser.close()
