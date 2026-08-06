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
await page.waitForTimeout(1500)
const snap = async (label) => {
  const s = await page.evaluate(() => {
    const visible = (el) =>
      el !== null &&
      el.offsetWidth > 0 &&
      el.offsetHeight > 0 &&
      getComputedStyle(el).visibility !== "hidden"
    return {
      dockedSidebarVisible: visible(document.querySelector(".sidebar:not(.drawer)")),
      drawerCount: document.querySelectorAll(".drawer").length,
      panelText: (document.querySelector(".sidebar")?.textContent ?? "").slice(0, 20),
    }
  })
  console.log(label, JSON.stringify(s))
  return s
}
await snap("BEFORE TOGGLE:")
await page.screenshot({ path: "qa-evidence/m1-before-toggle.png" })
await page.tap('[aria-label="Toggle panel"]')
await page.waitForTimeout(700)
await snap("AFTER TOGGLE:")
await page.screenshot({ path: "qa-evidence/m1-after-toggle.png" })
await browser.close()
