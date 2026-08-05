// iOS interaction QA: touch drag scrolls scrollback; visualViewport (keyboard) handling.
// Usage: node script/qa/ios-scenarios.mjs --base http://127.0.0.1:7809 --password qa-password-123 --evidence qa-evidence
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { chromium, devices } from "playwright"

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}
const base = arg("base", "http://127.0.0.1:7809")
const password = arg("password", "qa-password-123")
const evidenceDir = arg("evidence", "qa-evidence")
mkdirSync(evidenceDir, { recursive: true })

const results = []
const record = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? "PASS" : "FAIL"} ${name} — ${detail}`)
}

const browser = await chromium.launch()
const context = await browser.newContext({
  ...devices["iPhone 13"],
  viewport: { width: 375, height: 812 },
  hasTouch: true,
})
const page = await context.newPage()

await page.goto(base)
await page.fill("#password", password)
await page.click("button[type=submit]")
await page.waitForSelector(".terminal canvas", { timeout: 15000 })
await page.waitForTimeout(1500)

// fill scrollback with identifiable lines
await page.click(".terminal")
await page.keyboard.type("for i in $(seq 1 60); do echo scroll-line-$i; done", { delay: 5 })
await page.keyboard.press("Enter")
await page.waitForTimeout(2500)

async function viewportY() {
  return page.evaluate(() => globalThis.__wt?.terminal.viewportY ?? -1)
}

// --- I1: touch drag must scroll the scrollback ---
{
  const before = await viewportY()
  const box = await page.locator(".terminal").boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const client = await context.newCDPSession(page)
  // native touch semantics: finger drags DOWN to reveal older scrollback lines
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y: y - 150 }],
  })
  for (let i = 1; i <= 10; i++) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y - 150 + i * 15 }],
    })
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await page.waitForTimeout(600)
  const after = await viewportY()
  await page.screenshot({ path: join(evidenceDir, "ios-c1-touch-scroll.png") })
  record("I1 touch drag scrolls scrollback", after > before, `viewportY ${before} -> ${after}`)
}

// --- I2: keyboard (visualViewport shrink) keeps toolbar visible and refits ---
{
  const rowsBefore = await page.evaluate(() => globalThis.__wt?.terminal.rows ?? -1)
  const vvBefore = await page.evaluate(() => window.visualViewport?.height ?? 0)
  // simulate iOS keyboard: shrink the window; visualViewport tracks it in headless
  await page.setViewportSize({ width: 375, height: 470 })
  await page.waitForTimeout(800)
  const vvAfter = await page.evaluate(() => window.visualViewport?.height ?? 0)
  const rowsAfter = await page.evaluate(() => globalThis.__wt?.terminal.rows ?? -1)
  const toolbarState = await page.evaluate(() => {
    const toolbar = document.querySelector('[role="toolbar"]')
    const vv = window.visualViewport
    if (toolbar === null || vv === null) return { found: false }
    const rect = toolbar.getBoundingClientRect()
    const vvBottom = vv.height + vv.offsetTop
    return {
      found: true,
      toolbarBottom: rect.bottom,
      toolbarTop: rect.top,
      vvBottom,
      visible: rect.bottom <= vvBottom + 1 && rect.top >= vv.offsetTop - 1 && rect.height > 0,
    }
  })
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  await page.screenshot({ path: join(evidenceDir, "ios-c2-keyboard.png") })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.waitForTimeout(500)
  const pass =
    vvAfter < vvBefore &&
    toolbarState.found === true &&
    toolbarState.visible === true &&
    rowsAfter !== rowsBefore &&
    overflow <= 0
  record(
    "I2 keyboard keeps toolbar visible + refits",
    pass,
    `vv ${vvBefore}->${vvAfter} rows ${rowsBefore}->${rowsAfter} toolbar=${JSON.stringify(toolbarState)} overflow=${overflow}`,
  )
}

// --- I3: Korean IME-style input still works after interactions ---
{
  await page.tap(".terminal")
  await page.waitForTimeout(300)
  await page.keyboard.type("echo 한글-ime-$((3*14))", { delay: 5 })
  await page.keyboard.press("Enter")
  // true IME composition path (what a real iOS Korean IME produces)
  const imeClient = await context.newCDPSession(page)
  await imeClient.send("Input.imeSetComposition", {
    text: "조합",
    selectionStart: 2,
    selectionEnd: 2,
  })
  await imeClient.send("Input.insertText", { text: "조합" })
  await page.keyboard.press("Enter")
  let ok = false
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    const text = await page.evaluate(() => {
      const buffer = globalThis.__wt?.terminal.buffer.active
      if (buffer === undefined) return ""
      const lines = []
      for (let y = 0; y < buffer.length; y++) {
        const line = buffer.getLine(y)
        if (line) lines.push(line.translateToString(true))
      }
      return lines.join("\n")
    })
    if (text.includes("한글-ime-42") && text.includes("조합")) {
      ok = true
      break
    }
    await page.waitForTimeout(250)
  }
  await page.screenshot({ path: join(evidenceDir, "ios-c3-ime.png") })
  record("I3 Korean input regression", ok, "한글-ime-42 rendered")
}

await context.close()
await browser.close()
const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} iOS scenarios passed`)
process.exit(failed.length === 0 ? 0 : 1)
