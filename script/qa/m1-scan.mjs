import { chromium, devices } from "playwright"

const browser = await chromium.launch()
for (const w of [390, 430, 600, 700, 767, 768, 769, 800, 900]) {
  const ctx = await browser.newContext({
    ...devices["iPhone 13"],
    viewport: { width: w, height: 812 },
    hasTouch: true,
  })
  const page = await ctx.newPage()
  await page.goto("http://127.0.0.1:7815")
  await page.fill("#password", "qa-password-123")
  await page.click("button[type=submit]")
  await page.waitForSelector(".terminal canvas", { timeout: 15000 })
  await page.waitForTimeout(1200)
  const before = await page.evaluate(() => {
    const v = (el) => el !== null && el.offsetWidth > 0 && el.offsetHeight > 0
    return {
      docked: v(document.querySelector(".sidebar:not(.drawer)")),
      drawer: document.querySelectorAll(".drawer").length,
    }
  })
  await page.tap('[aria-label="Toggle panel"]')
  await page.waitForTimeout(600)
  const after = await page.evaluate(() => {
    const v = (el) => el !== null && el.offsetWidth > 0 && el.offsetHeight > 0
    return {
      docked: v(document.querySelector(".sidebar:not(.drawer)")),
      drawer: document.querySelectorAll(".drawer").length,
    }
  })
  const dup = (before.docked && after.drawer > 0) || (after.docked && after.drawer > 0)
  console.log(`w=${w} before:${JSON.stringify(before)} after:${JSON.stringify(after)} DUP=${dup}`)
  await ctx.close()
}
await browser.close()
