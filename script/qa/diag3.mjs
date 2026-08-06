import { chromium, devices } from "playwright"

const browser = await chromium.launch()
const results = {}

// D1: drawer toggle-close via hamburger (mobile)
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
  const overlayCount = () => page.evaluate(() => document.querySelectorAll(".overlay").length)
  await page.tap('[aria-label="Toggle panel"]')
  await page.waitForTimeout(700)
  const opened = await overlayCount()
  await page.tap('[aria-label="Toggle panel"]')
  await page.waitForTimeout(900)
  const closed = await overlayCount()
  results.d1_toggle = { opened, closed, toggleCloses: opened === 1 && closed === 0 }
  await ctx.close()
}

// D2: Cmd+Delete kills the line (desktop)
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto("http://127.0.0.1:7809")
  await page.fill("#password", "qa-password-123")
  await page.click("button[type=submit]")
  await page.waitForSelector(".terminal canvas", { timeout: 15000 })
  await page.waitForTimeout(1500)
  await page.click(".terminal")
  await page.keyboard.type("echo keepme-nope", { delay: 10 })
  await page.keyboard.press("Meta+Backspace")
  await page.waitForTimeout(400)
  await page.keyboard.type("confirm", { delay: 10 })
  await page.keyboard.press("Enter")
  await page.waitForTimeout(1200)
  const tail = await page.evaluate(() => {
    const b = globalThis.__wt.terminal.buffer.active
    const lines = []
    for (let y = 0; y < b.length; y++) {
      const s = b.getLine(y)?.translateToString(true)
      if (s && s.trim()) lines.push(s.trim())
    }
    return lines.slice(-4).join(" | ")
  })
  // After Cmd+Delete the line should be cleared, so only "confirm" (from the retype) should run,
  // NOT "echo keepme-nope confirm". PASS = tail contains "confirm" but NOT "keepme-nope".
  results.d2_cmddelete = {
    tail,
    lineKilled: tail.includes("confirm") && !tail.includes("keepme-nope"),
  }
  await page.close()
}

// D3: Korean via composition lands exactly once (desktop)
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto("http://127.0.0.1:7809")
  await page.fill("#password", "qa-password-123")
  await page.click("button[type=submit]")
  await page.waitForSelector(".terminal canvas", { timeout: 15000 })
  await page.waitForTimeout(1500)
  await page.click(".terminal")
  await page.keyboard.type("echo ", { delay: 10 })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Input.imeSetComposition", {
    text: "한글조합",
    selectionStart: 4,
    selectionEnd: 4,
  })
  await cdp.send("Input.insertText", { text: "한글조합" })
  await page.keyboard.press("Enter")
  await page.waitForTimeout(1500)
  const found = await page.evaluate(() => {
    const b = globalThis.__wt.terminal.buffer.active
    let count = 0
    for (let y = 0; y < b.length; y++) {
      const s = b.getLine(y)?.translateToString(true) ?? ""
      count += s.split("한글조합").length - 1
    }
    return count
  })
  // echo line shows the text once, output shows it once => 2 occurrences is correct (echo + result)
  results.d3_korean = { occurrences: found, landsOnce: found === 2 }
  await page.close()
}

console.log(JSON.stringify(results, null, 1))
await browser.close()
