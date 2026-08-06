import { chromium, devices } from "playwright"

const browser = await chromium.launch()
for (const w of [375, 768, 800, 900, 1280]) {
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
  const state = async () =>
    page.evaluate(() => {
      const v = (el) => el !== null && el.offsetWidth > 0 && el.offsetHeight > 0
      return {
        docked: v(document.querySelector(".sidebar:not([hidden])")),
        drawer: document.querySelectorAll(".drawer").length,
        overlay: document.querySelectorAll(".overlay").length,
      }
    })
  const before = await state()
  await page.tap('[aria-label="Toggle panel"]')
  await page.waitForTimeout(600)
  const afterOpen = await state()
  await page.tap('[aria-label="Toggle panel"]')
  await page.waitForTimeout(700)
  const afterClose = await state()
  // mobile: drawer opens then closes; desktop: docked collapses then expands. Never both docked+drawer.
  const mobile = w < 768
  const dup = afterOpen.docked && afterOpen.drawer > 0
  const ok = mobile
    ? afterOpen.drawer === 1 && afterClose.drawer === 0 && !dup
    : before.docked === true &&
      afterOpen.docked === false &&
      afterOpen.drawer === 0 &&
      afterClose.docked === true &&
      !dup
  console.log(
    `w=${w} ${mobile ? "mobile" : "desktop"} open=${JSON.stringify(afterOpen)} close=${JSON.stringify(afterClose)} OK=${ok} DUP=${dup}`,
  )
  await ctx.close()
}
await browser.close()
