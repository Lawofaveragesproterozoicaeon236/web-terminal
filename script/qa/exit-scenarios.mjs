// Real-surface QA driver: E1 exit leaves a usable terminal, E2 reload after exit
// starts a fresh shell instead of resuming a dead one (the "frozen after exit" bug).
// Usage: node script/qa/exit-scenarios.mjs --base http://127.0.0.1:7821 --password qa-password-123

import { chromium } from "playwright"

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

const base = arg("base", "http://127.0.0.1:7821")
const password = arg("password", "qa-password-123")

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

function terminalText(page) {
  return page.evaluate(() => {
    const buffer = globalThis.__wt.terminal.buffer.active
    const lines = []
    for (let y = 0; y < buffer.length; y++) {
      const line = buffer.getLine(y)
      if (line !== undefined && line !== null) lines.push(line.translateToString(true))
    }
    return lines.join("\n")
  })
}

async function waitForText(page, needle, timeout = 15000) {
  await page.waitForFunction(
    (text) => {
      const buffer = globalThis.__wt.terminal.buffer.active
      for (let y = 0; y < buffer.length; y++) {
        const line = buffer.getLine(y)
        if (line?.translateToString(true).includes(text) === true) return true
      }
      return false
    },
    needle,
    { timeout },
  )
}

async function run() {
  const browser = await chromium.launch()

  // ---- E1: exit shows the notice and Enter starts a working shell ----
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await login(page)
    await page.waitForTimeout(2000)
    await page.click(".terminal")
    await page.keyboard.type("exit")
    await page.keyboard.press("Enter")
    await waitForText(page, "session exited")
    const notice = await terminalText(page)
    record(
      "E1 exit is announced, not silent",
      notice.includes("session exited"),
      `notice rendered: ${notice.includes("session exited")}`,
    )

    // The freeze symptom: input after exit produced nothing at all.
    await page.keyboard.press("Enter")
    await page.waitForFunction(
      () => globalThis.__wt.connection.sessionId !== undefined,
      undefined,
      { timeout: 15000 },
    )
    const marker = `revived-${Date.now()}`
    await page.keyboard.type(`echo ${marker}`)
    await page.keyboard.press("Enter")
    let revived = true
    try {
      await waitForText(page, marker)
    } catch {
      revived = false
    }
    record(
      "E1b Enter after exit gives a working shell",
      revived,
      revived ? `new shell echoed ${marker}` : "terminal stayed frozen after exit",
    )
    await page.close()
  }

  // ---- E2: reloading after an exit must not resume the dead session ----
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await login(page)
    await page.waitForTimeout(2000)
    const deadId = await page.evaluate(() => globalThis.__wt.connection.sessionId)
    await page.click(".terminal")
    await page.keyboard.type("exit")
    await page.keyboard.press("Enter")
    await waitForText(page, "session exited")

    // Re-arm the dead id the way a stale tab or restored session would, so this
    // exercises the server's refusal rather than only the client's cleanup.
    await page.evaluate((id) => localStorage.setItem("wt:session-id", id), deadId)
    await page.reload()
    await page.waitForSelector(".terminal canvas", { timeout: 15000 })
    await page.waitForTimeout(2500)
    await page.click(".terminal")
    const marker = `after-reload-${Date.now()}`
    await page.keyboard.type(`echo ${marker}`)
    await page.keyboard.press("Enter")
    let usable = true
    try {
      await waitForText(page, marker)
    } catch {
      usable = false
    }
    record(
      "E2 reload after exit starts a fresh shell",
      usable,
      usable ? `fresh shell echoed ${marker}` : "reload resumed the dead session (frozen)",
    )
    await page.close()
  }

  await browser.close()
  const passed = results.filter((r) => r.pass).length
  console.log(`\n${passed}/${results.length} scenarios passed`)
  process.exit(passed === results.length ? 0 : 1)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
