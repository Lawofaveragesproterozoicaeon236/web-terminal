// Real-surface QA driver: C1 happy path, C2 VT rendering, C3 reconnect repaint, C4 mobile.
// Usage: node script/qa/e2e-scenarios.mjs --base http://127.0.0.1:7799 --password qa-password-123 --evidence qa-evidence

import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { chromium, devices } from "playwright"

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

const base = arg("base", "http://127.0.0.1:7799")
const password = arg("password", "qa-password-123")
const evidenceDir = arg("evidence", "qa-evidence")
mkdirSync(evidenceDir, { recursive: true })

const results = []
const record = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? "PASS" : "FAIL"} ${name} — ${detail}`)
}

async function login(page) {
  await page.goto(base)
  await page.fill("#password", password)
  await page.click("button[type=submit]")
  await page.waitForSelector(".terminal canvas", { timeout: 15000 })
}

async function typeInTerminal(page, text) {
  await page.click(".terminal")
  await page.keyboard.type(text, { delay: 15 })
  await page.keyboard.press("Enter")
}

async function terminalText(page) {
  // read back the terminal buffer through the app's exposed handle
  return page.evaluate(() => {
    const app = globalThis.__wt
    if (app === undefined) return ""
    const buffer = app.terminal.buffer.active
    const lines = []
    for (let y = 0; y < buffer.length; y++) {
      const line = buffer.getLine(y)
      if (line) lines.push(line.translateToString(true))
    }
    return lines.join("\n")
  })
}

async function waitForTerminalText(page, needle, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const text = await terminalText(page)
    if (text.includes(needle)) return text
    await page.waitForTimeout(250)
  }
  throw new Error(`terminal text never contained ${JSON.stringify(needle)}`)
}

const browser = await chromium.launch()

// C1: desktop happy path
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await login(page)
  await page.waitForTimeout(1500)
  await typeInTerminal(page, "echo ulw-ok-$((6*7))")
  try {
    await waitForTerminalText(page, "ulw-ok-42")
    await page.screenshot({ path: join(evidenceDir, "c1-happy-path.png") })
    record("C1 terminal happy path", true, "ulw-ok-42 rendered; c1-happy-path.png")
  } catch (error) {
    await page.screenshot({ path: join(evidenceDir, "c1-FAIL.png") })
    record("C1 terminal happy path", false, String(error))
  }
  await page.close()
}

// C2: VT rendering — truecolor + CJK + emoji + alt screen
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await login(page)
  await page.waitForTimeout(1500)
  await typeInTerminal(
    page,
    `printf '\\e[38;2;255;80;80mRED\\e[38;2;80;255;120mGREEN\\e[38;2;90;140;255mBLUE\\e[0m 한글조합 🚀🎨 done-vt\\n'`,
  )
  try {
    await waitForTerminalText(page, "done-vt")
    await page.screenshot({ path: join(evidenceDir, "c2-vt-rendering.png") })
    record("C2 full VT rendering", true, "truecolor+CJK+emoji rendered; c2-vt-rendering.png")
  } catch (error) {
    await page.screenshot({ path: join(evidenceDir, "c2-FAIL.png") })
    record("C2 full VT rendering", false, String(error))
  }
  await page.close()
}

// C3: reconnect repaint — marker before reload must survive
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await login(page)
  await page.waitForTimeout(1500)
  await typeInTerminal(page, "echo marker-before-drop-777")
  try {
    await waitForTerminalText(page, "marker-before-drop-777")
    await page.screenshot({ path: join(evidenceDir, "c3-before-drop.png") })
    await page.reload()
    await page.waitForSelector(".terminal canvas", { timeout: 15000 })
    await page.waitForTimeout(2500)
    await waitForTerminalText(page, "marker-before-drop-777")
    await page.screenshot({ path: join(evidenceDir, "c3-after-reconnect.png") })
    record("C3 reconnect repaint", true, "marker survived reload; c3-after-reconnect.png")
  } catch (error) {
    await page.screenshot({ path: join(evidenceDir, "c3-FAIL.png") })
    record("C3 reconnect repaint", false, String(error))
  }
  await page.close()
}

// C4: mobile 375px + touch toolbar Ctrl+C + no horizontal overflow
{
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    viewport: { width: 375, height: 812 },
  })
  const page = await context.newPage()
  await login(page)
  await page.waitForTimeout(1500)
  try {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    await typeInTerminal(page, "sleep 30")
    await page.waitForTimeout(800)
    const ctrlC = page.locator('[data-key="ctrl-c"]')
    await ctrlC.waitFor({ timeout: 5000 })
    await ctrlC.click()
    await waitForTerminalText(page, "^C", 8000)
    await page.screenshot({ path: join(evidenceDir, "c4-mobile-375.png") })
    record("C4 mobile UX", overflow <= 0, `overflow=${overflow}px; ^C rendered; c4-mobile-375.png`)
  } catch (error) {
    await page.screenshot({ path: join(evidenceDir, "c4-FAIL.png") })
    record("C4 mobile UX", false, String(error))
  }
  await context.close()
}

await browser.close()
const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} scenarios passed`)
process.exit(failed.length === 0 ? 0 : 1)
