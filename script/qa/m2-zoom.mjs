import { chromium } from "playwright"

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 500 } })
await page.goto("http://127.0.0.1:7815")
await page.fill("#password", "qa-password-123")
await page.click("button[type=submit]")
await page.waitForSelector(".terminal canvas", { timeout: 15000 })
await page.waitForTimeout(1500)
await page.click(".terminal")
await page.keyboard.type(
  "printf 'BRANCH:[\\ue0a0] FOLDER:[\\uf07b] CHECK:[\\uf00c] DOCKER:[\\uf308]\\n'",
)
await page.keyboard.press("Enter")
await page.waitForTimeout(2200)
// zoom into the terminal canvas region only
const box = await page.locator(".terminal").boundingBox()
await page.screenshot({
  path: "qa-evidence/m2-nerdfont-zoom.png",
  clip: { x: box.x, y: box.y, width: Math.min(box.width, 760), height: 120 },
})
console.log("captured")
await browser.close()
