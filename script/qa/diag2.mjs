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
const geo = await page.evaluate(() => {
  const overlay = document.querySelector(".overlay")
  const drawer = document.querySelector(".drawer")
  const scrim = document.querySelector(".overlay__scrim")
  const obox = overlay?.getBoundingClientRect()
  const dbox = drawer?.getBoundingClientRect()
  const sbox = scrim?.getBoundingClientRect()
  const cs = drawer ? getComputedStyle(drawer) : null
  return {
    overlayRect: obox && { x: obox.x, y: obox.y, w: obox.width, h: obox.height },
    drawerRect: dbox && { x: dbox.x, w: dbox.width, h: dbox.height },
    scrimRect: sbox && { x: sbox.x, w: sbox.width, h: sbox.height },
    drawerInlineSize: cs?.inlineSize,
    drawerJustify: cs?.justifySelf,
    drawerTransform: cs?.transform,
    drawerDisplay: cs?.display,
    vw: window.innerWidth,
  }
})
console.log("GEO:", JSON.stringify(geo, null, 1))
// close button exists?
const closeBtn = await page.evaluate(() => {
  const b = document.querySelector('.drawer [aria-label="Close panel"]')
  return b ? "present" : "MISSING"
})
console.log("close button:", closeBtn)
// tap close button
if (closeBtn === "present") {
  await page.tap('.drawer [aria-label="Close panel"]')
  await page.waitForTimeout(700)
  const after = await page.evaluate(() => ({ overlay: !!document.querySelector(".overlay") }))
  console.log("after close btn:", JSON.stringify(after))
}
await browser.close()
