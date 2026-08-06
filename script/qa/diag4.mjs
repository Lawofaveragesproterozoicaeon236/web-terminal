import { chromium, devices } from "playwright"

const browser = await chromium.launch()
const ctx = await browser.newContext({
  ...devices["iPhone 13"],
  viewport: { width: 375, height: 812 },
  hasTouch: true,
})
const page = await ctx.newPage()
await page.goto("http://127.0.0.1:7809")
await page.fill("#password", "qa-password-123")
await page.click("button[type=submit]")
await page.waitForSelector(".terminal canvas", { timeout: 15000 })
await page.waitForTimeout(1200)
await page.tap('[aria-label="Toggle panel"]')
await page.waitForTimeout(700)
await page.screenshot({ path: "qa-evidence/d1-drawer-open.png" })
await page.tap('[aria-label="Toggle panel"]')
await page.waitForTimeout(900)
await page.screenshot({ path: "qa-evidence/d1-drawer-closed.png" })
const overlay = await page.evaluate(() => document.querySelectorAll(".overlay").length)
console.log("closed overlay count:", overlay)
await browser.close()
