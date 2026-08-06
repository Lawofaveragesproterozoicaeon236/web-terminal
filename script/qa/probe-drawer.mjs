import { chromium, devices } from "playwright"

const browser = await chromium.launch()
const context = await browser.newContext({
  ...devices["iPhone 13"],
  viewport: { width: 375, height: 812 },
  hasTouch: true,
})
const page = await context.newPage()
await page.goto("http://127.0.0.1:7777")
await page.fill("#password", process.env.WTPW)
await page.click("button[type=submit]")
await page.waitForSelector(".terminal canvas", { timeout: 15000 })
await page.waitForTimeout(1200)

const state = async (label) => {
  const s = await page.evaluate(() => {
    const overlay = document.querySelector(".overlay")
    const drawer = document.querySelector(".drawer")
    const scrim = document.querySelector(".overlay__scrim")
    const toggle = document.querySelector('[aria-label="Toggle panel"]')
    return {
      overlay: overlay !== null,
      drawerVisible: drawer !== null && getComputedStyle(drawer).display !== "none",
      scrimPresent: scrim !== null,
      toggleExpanded: toggle?.getAttribute("aria-expanded"),
      bodyChildren: Array.from(document.body.children).map((c) => c.className || c.tagName),
    }
  })
  console.log(label, JSON.stringify(s))
  return s
}

await state("INITIAL:")
// tap hamburger
await page.tap('[aria-label="Toggle panel"]')
await page.waitForTimeout(700)
await state("AFTER OPEN:")
// try to close via hamburger again
await page.tap('[aria-label="Toggle panel"]')
await page.waitForTimeout(700)
await state("AFTER 2ND TAP:")
await browser.close()
