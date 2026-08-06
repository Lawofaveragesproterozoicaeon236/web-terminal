import { chromium, devices } from "playwright"

const browser = await chromium.launch()
const results = {}

async function readTail(page, n = 3) {
  return page.evaluate((k) => {
    const b = globalThis.__wt.terminal.buffer.active
    const lines = []
    for (let y = 0; y < b.length; y++) {
      const s = b.getLine(y)?.translateToString(true)
      if (s?.trim()) lines.push(s.trim())
    }
    return lines.slice(-k).join(" | ")
  }, n)
}

{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto("http://127.0.0.1:7815")
  await page.fill("#password", "qa-password-123")
  await page.click("button[type=submit]")
  await page.waitForSelector(".terminal canvas", { timeout: 15000 })
  await page.waitForTimeout(1800)
  await page.click(".terminal")
  await page.waitForTimeout(400)
  await page.keyboard.press("Enter")
  await page.waitForTimeout(400)
  await page.keyboard.type("bash ~/mousetest.sh", { delay: 25 })
  await page.keyboard.press("Enter")
  await page.waitForTimeout(1500)
  const box = await page.locator(".terminal canvas").boundingBox()
  await page.mouse.click(box.x + 300, box.y + 200)
  await page.waitForTimeout(700)
  results.m3_click = await readTail(page)
  await page.mouse.move(box.x + 300, box.y + 200)
  await page.mouse.wheel(0, 120)
  await page.waitForTimeout(700)
  results.m4_wheel = await readTail(page)
  await page.close()
}

{
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
  await page.waitForTimeout(1800)
  await page.tap(".terminal")
  await page.waitForTimeout(400)
  await page.keyboard.press("Enter")
  await page.waitForTimeout(400)
  await page.keyboard.type("bash ~/mousetest.sh", { delay: 25 })
  await page.keyboard.press("Enter")
  await page.waitForTimeout(1500)
  const client = await ctx.newCDPSession(page)
  const box = await page.locator(".terminal canvas").boundingBox()
  const x = box.x + 150,
    y = box.y + 200
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await page.waitForTimeout(700)
  results.m5_tap = await readTail(page)
  await ctx.close()
}

console.log(JSON.stringify(results, null, 1))
await browser.close()
