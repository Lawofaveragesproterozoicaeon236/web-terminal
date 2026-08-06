import { chromium } from "playwright"

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto("http://127.0.0.1:7815")
await page.fill("#password", "qa-password-123")
await page.click("button[type=submit]")
await page.waitForSelector(".terminal canvas", { timeout: 15000 })
await page.waitForTimeout(1500)
await page.click(".terminal")
await page.keyboard.type("printf 'git:\\ue0a0 folder:\\uf07b check:\\uf00c nf-ok\\n'")
await page.keyboard.press("Enter")
await page.waitForTimeout(2000)
const f = await page.evaluate(() => ({
  count: document.fonts.size,
  loaded: document.fonts.check('14px "SymbolsNerdFontMono"'),
  stack: globalThis.__wt.terminal.options.fontFamily,
}))
console.log(JSON.stringify(f))
await page.screenshot({ path: "qa-evidence/m2-nerdfont-after.png" })
await browser.close()
