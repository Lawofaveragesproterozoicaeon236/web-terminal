import { chromium, devices } from "playwright"

const browser = await chromium.launch()
const results = {}

// D1 drawer (mobile)
{
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
  const snap = async () =>
    page.evaluate(() => ({
      overlay: !!document.querySelector(".overlay"),
      drawer: !!document.querySelector(".drawer"),
      scrimVisible: !!document.querySelector(".overlay__scrim"),
      expanded: document
        .querySelector('[aria-label="Toggle panel"]')
        ?.getAttribute("aria-expanded"),
    }))
  results.drawer_initial = await snap()
  await page.tap('[aria-label="Toggle panel"]')
  await page.waitForTimeout(700)
  results.drawer_open = await snap()
  await page.screenshot({ path: "qa-evidence/d1-drawer-open.png" })
  // try scrim tap to close
  const scrim = await page.evaluate(() => !!document.querySelector(".overlay__scrim"))
  if (scrim) {
    const box = await page.locator(".overlay__scrim").boundingBox()
    if (box) await page.tap(".overlay__scrim")
    await page.waitForTimeout(700)
  }
  results.drawer_after_scrimtap = await snap()
  await ctx.close()
}

// D2 Cmd+Delete + D3 Korean (desktop context for keyboard)
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto("http://127.0.0.1:7809")
  await page.fill("#password", "qa-password-123")
  await page.click("button[type=submit]")
  await page.waitForSelector(".terminal canvas", { timeout: 15000 })
  await page.waitForTimeout(1500)
  await page.click(".terminal")
  await page.keyboard.type("echo hello-marker", { delay: 10 })
  // D2: press Cmd+Delete (should kill line, currently does nothing)
  await page.keyboard.press("Meta+Backspace")
  await page.waitForTimeout(400)
  await page.keyboard.press("Enter")
  await page.waitForTimeout(1200)
  const tail = await page.evaluate(() => {
    const b = globalThis.__wt.terminal.buffer.active
    const lines = []
    for (let y = 0; y < b.length; y++) {
      const s = b.getLine(y)?.translateToString(true)
      if (s && s.trim()) lines.push(s.trim())
    }
    return lines.slice(-4)
  })
  results.cmdDelete_tail = tail
  // D3: Korean via composition
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Input.imeSetComposition", {
    text: "한글조합",
    selectionStart: 4,
    selectionEnd: 4,
  })
  await cdp.send("Input.insertText", { text: "한글조합" })
  await page.keyboard.press("Enter")
  await page.waitForTimeout(1500)
  const tail2 = await page.evaluate(() => {
    const b = globalThis.__wt.terminal.buffer.active
    const lines = []
    for (let y = 0; y < b.length; y++) {
      const s = b.getLine(y)?.translateToString(true)
      if (s && s.trim()) lines.push(s.trim())
    }
    return lines.slice(-3)
  })
  results.korean_tail = tail2
  await page.close()
}

console.log(JSON.stringify(results, null, 1))
await browser.close()
