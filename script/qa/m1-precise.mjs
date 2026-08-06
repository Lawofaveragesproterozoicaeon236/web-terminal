import { chromium, devices } from "playwright"

const browser = await chromium.launch()
const ctx = await browser.newContext({
  ...devices["iPhone 13"],
  viewport: { width: 375, height: 812 },
  hasTouch: true,
})
const page = await ctx.newPage()
await page.goto("http://127.0.0.1:7815")
await page.fill("#password", "qa-password-123")
await page.click("button[type=submit]")
await page.waitForSelector(".terminal canvas", { timeout: 15000 })
await page.waitForTimeout(1200)
const state = async () =>
  page.evaluate(() => {
    const dockedAside = document.querySelector("aside.sidebar:not(.drawer)")
    return {
      dockedAsideHidden: dockedAside?.hasAttribute("hidden") ?? "no-aside",
      dockedAsideChildren: dockedAside?.childElementCount ?? -1,
      drawer: document.querySelectorAll("aside.drawer").length,
      overlay: document.querySelectorAll(".overlay").length,
    }
  })
console.log("initial:", JSON.stringify(await state()))
await page.tap('[aria-label="Toggle panel"]')
await page.waitForTimeout(700)
console.log("open:", JSON.stringify(await state()))
await page.tap('[aria-label="Toggle panel"]')
await page.waitForTimeout(800)
console.log("closed:", JSON.stringify(await state()))
await browser.close()
