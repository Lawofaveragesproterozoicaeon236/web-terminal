import { chromium } from "playwright"

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 400 } })
await page.goto("http://127.0.0.1:7815")
await page.fill("#password", "qa-password-123")
await page.click("button[type=submit]")
await page.waitForSelector(".terminal canvas", { timeout: 15000 })
await page.waitForTimeout(1200)
await page.evaluate(() => {
  const host = document.createElement("div")
  host.id = "font-probe"
  host.style.cssText =
    "position:fixed;top:0;left:0;z-index:9999;background:#111;color:#fff;padding:12px;font-size:32px;"
  const glyph = "\ue0a0\uf07b\uf00c"
  host.innerHTML = `
    <div style="font-family:'SymbolsNerdFontMono'">nerd-only: <span>${glyph}</span></div>
    <div style="font-family:'JetBrains Mono','SymbolsNerdFontMono',monospace">stack: <span>${glyph}</span></div>
    <div style="font-family:monospace">mono-only: <span>${glyph}</span></div>`
  document.body.appendChild(host)
})
await page.waitForTimeout(600)
await page.screenshot({
  path: "qa-evidence/m2-fontprobe.png",
  clip: { x: 0, y: 0, width: 700, height: 220 },
})
console.log("captured")
await browser.close()
