import { chromium } from "playwright"

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto("http://127.0.0.1:7815")
await page.fill("#password", "qa-password-123")
await page.click("button[type=submit]")
await page.waitForSelector(".terminal canvas", { timeout: 15000 })
await page.waitForTimeout(1500)
await page.click(".terminal")
// git branch U+E0A0, folder U+F07B, check U+F00C
await page.keyboard.type("printf 'git:\\ue0a0 folder:\\uf07b check:\\uf00c nerdfont-marker\\n'")
await page.keyboard.press("Enter")
await page.waitForTimeout(1800)
await page.screenshot({ path: "qa-evidence/m2-nerdfont-before.png" })
const fontsLoaded = await page.evaluate(() => document.fonts.size)
console.log("document.fonts.size:", fontsLoaded)
await browser.close()
