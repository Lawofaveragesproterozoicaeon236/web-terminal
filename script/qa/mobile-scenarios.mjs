// Real-surface QA driver for the Termius-grade mobile criteria:
// M1 iOS Korean composes via delete+reinsert, M2 hold-repeat survives finger
// drift, M3 the shell rides the virtual keyboard's top edge, M4 shift latch
// sends shifted keys, M5 pinch-to-zoom changes font size.
// Usage: node script/qa/mobile-scenarios.mjs --base http://127.0.0.1:7822 --password qa-password-123 --evidence qa-evidence

import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { chromium, devices } from "playwright"

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

const base = arg("base", "http://127.0.0.1:7822")
const password = arg("password", "qa-password-123")
const evidenceDir = arg("evidence", "qa-evidence")
mkdirSync(evidenceDir, { recursive: true })

const results = []
const record = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? "PASS" : "FAIL"} ${name} — ${detail}`)
}

async function newMobilePage(browser, initScript) {
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    viewport: { width: 375, height: 812 },
    hasTouch: true,
  })
  const page = await context.newPage()
  if (initScript !== undefined) await page.addInitScript(initScript)
  await page.goto(base)
  await page.fill("#password", password)
  await page.click("button[type=submit]")
  await page.waitForSelector(".terminal canvas", { timeout: 15000 })
  await page.waitForTimeout(2000)
  return { context, page }
}

async function armSendSpy(page) {
  await page.evaluate(() => {
    const connection = globalThis.__wt.connection
    globalThis.__sent = []
    const original = connection.sendInput.bind(connection)
    connection.sendInput = (data) => {
      globalThis.__sent.push(data)
      return original(data)
    }
  })
}

async function run() {
  const browser = await chromium.launch()

  // ---- M1: iOS Korean delete+reinsert composition ----
  {
    const { context, page } = await newMobilePage(browser)
    await page.evaluate(() => globalThis.__wt.terminal.textarea?.focus())
    await armSendSpy(page)
    await page.evaluate(() => {
      const textarea = globalThis.__wt.terminal.textarea
      const fire = (inputType, data) => {
        textarea.dispatchEvent(
          new InputEvent("beforeinput", { inputType, data, bubbles: true, cancelable: true }),
        )
      }
      // The exact event stream the iOS Korean keyboard emits for ㅎ->하->한.
      fire("insertText", "ㅎ")
      fire("deleteContentBackward", null)
      fire("insertText", "하")
      fire("deleteContentBackward", null)
      fire("insertText", "한")
    })
    const sent = await page.evaluate(() => globalThis.__sent)
    const expected = ["ㅎ", "\u007f", "하", "\u007f", "한"]
    const pass = JSON.stringify(sent) === JSON.stringify(expected)
    record(
      "M1 iOS Korean composes via delete+reinsert",
      pass,
      `sent=${JSON.stringify(sent)} expected=${JSON.stringify(expected)}`,
    )
    await context.close()
  }

  // ---- M2: hold-repeat survives finger drift ----
  {
    const { context, page } = await newMobilePage(browser)
    await armSendSpy(page)
    const counts = await page.evaluate(async () => {
      const cap = document.querySelector('[data-key="up"]')
      const rect = cap.getBoundingClientRect()
      const cx = rect.x + rect.width / 2
      const cy = rect.y + rect.height / 2
      const opts = {
        pointerId: 7,
        pointerType: "touch",
        isPrimary: true,
        bubbles: true,
        cancelable: true,
      }
      cap.dispatchEvent(new PointerEvent("pointerdown", { ...opts, clientX: cx, clientY: cy }))
      globalThis.__sent.length = 0
      // Finger drift: the browser reports the pointer leaving the cap's bounds.
      cap.dispatchEvent(
        new PointerEvent("pointermove", { ...opts, clientX: cx + 30, clientY: cy - 30 }),
      )
      cap.dispatchEvent(
        new PointerEvent("pointerleave", { ...opts, clientX: cx + 30, clientY: cy - 30 }),
      )
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 900))
      const afterDrift = globalThis.__sent.filter((d) => d === "\u001b[A").length
      cap.dispatchEvent(new PointerEvent("pointerup", { ...opts, clientX: cx, clientY: cy }))
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
      const afterUp = globalThis.__sent.filter((d) => d === "\u001b[A").length
      return { afterDrift, afterUp }
    })
    const pass = counts.afterDrift >= 4 && counts.afterUp - counts.afterDrift <= 2
    record(
      "M2 hold-repeat survives drift and stops on release",
      pass,
      `repeats after drift=${counts.afterDrift} (need >=4); extra after release=${counts.afterUp - counts.afterDrift} (cap 2)`,
    )
    await context.close()
  }

  // ---- M3: shell rides the virtual keyboard ----
  {
    const { context, page } = await newMobilePage(browser, () => {
      class FakeViewport extends EventTarget {
        height = window.innerHeight
        width = window.innerWidth
        offsetTop = 0
        offsetLeft = 0
        scale = 1
        pageTop = 0
        pageLeft = 0
      }
      const stub = new FakeViewport()
      Object.defineProperty(window, "visualViewport", { value: stub, configurable: true })
      globalThis.__vvStub = stub
    })
    const before = await page.evaluate(() => ({
      rows: globalThis.__wt.terminal.rows,
      shellH: document.querySelector(".shell")?.getBoundingClientRect().height,
    }))
    await page.evaluate(() => {
      const stub = globalThis.__vvStub
      stub.height = 470
      stub.dispatchEvent(new Event("resize"))
    })
    await page.waitForTimeout(1200)
    const after = await page.evaluate(() => ({
      rows: globalThis.__wt.terminal.rows,
      shellH: document.querySelector(".shell")?.getBoundingClientRect().height,
      toolbarBottom: document
        .querySelector(".keybar")
        ?.closest(".stack")
        ?.getBoundingClientRect().bottom,
    }))
    const pass =
      Math.abs((after.shellH ?? 0) - 470) <= 1 &&
      after.rows < before.rows &&
      Math.abs((after.toolbarBottom ?? 0) - 470) <= 2
    record(
      "M3 shell rides the virtual keyboard top edge",
      pass,
      `shellH ${before.shellH}->${after.shellH} (want 470) rows ${before.rows}->${after.rows} toolbarBottom=${after.toolbarBottom}`,
    )
    await page.screenshot({ path: join(evidenceDir, "m3-keyboard-resize.png") })
    await context.close()
  }

  // ---- M4: shift latch sends shifted keys ----
  {
    const { context, page } = await newMobilePage(browser)
    await armSendSpy(page)
    const shiftCap = await page.locator('[data-key="shift"]').count()
    if (shiftCap === 0) {
      record("M4 shift latch sends shifted keys", false, "no shift cap in the keybar")
    } else {
      const tapKey = (key) =>
        page.evaluate((id) => {
          const cap = document.querySelector(`[data-key="${id}"]`)
          const rect = cap.getBoundingClientRect()
          cap.dispatchEvent(
            new PointerEvent("pointerdown", {
              pointerId: 3,
              pointerType: "touch",
              isPrimary: true,
              bubbles: true,
              cancelable: true,
              clientX: rect.x + rect.width / 2,
              clientY: rect.y + rect.height / 2,
            }),
          )
          cap.dispatchEvent(
            new PointerEvent("pointerup", {
              pointerId: 3,
              pointerType: "touch",
              isPrimary: true,
              bubbles: true,
              clientX: rect.x + rect.width / 2,
              clientY: rect.y + rect.height / 2,
            }),
          )
        }, key)
      await tapKey("shift")
      await tapKey("tab")
      await tapKey("shift")
      await tapKey("up")
      const sent = await page.evaluate(() => globalThis.__sent)
      const pass = sent.includes("\u001b[Z") && sent.includes("\u001b[1;2A")
      record(
        "M4 shift latch sends shifted keys",
        pass,
        `sent=${JSON.stringify(sent)} (want \\x1b[Z and \\x1b[1;2A)`,
      )
    }
    await context.close()
  }

  // ---- M5: pinch-to-zoom font size ----
  {
    const { context, page } = await newMobilePage(browser)
    const result = await page.evaluate(async () => {
      const terminal = globalThis.__wt.terminal
      const container = document.querySelector(".terminal")
      const before = terminal.options.fontSize
      const mk = (id, x, y) =>
        new Touch({ identifier: id, target: container, clientX: x, clientY: y })
      const fire = (type, touches) => {
        container.dispatchEvent(
          new TouchEvent(type, {
            touches,
            changedTouches: touches,
            bubbles: true,
            cancelable: true,
          }),
        )
      }
      fire("touchstart", [mk(1, 150, 300), mk(2, 250, 300)])
      for (let gap = 100; gap <= 220; gap += 20) {
        fire("touchmove", [mk(1, 200 - gap / 2, 300), mk(2, 200 + gap / 2, 300)])
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 30))
      }
      fire("touchend", [])
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 300))
      return { before, after: terminal.options.fontSize }
    })
    const pass = result.after > result.before && result.after <= 24
    record(
      "M5 pinch-to-zoom grows font size",
      pass,
      `fontSize ${result.before} -> ${result.after} (want increase, cap 24)`,
    )
    await page.screenshot({ path: join(evidenceDir, "m5-pinch-zoom.png") })
    await context.close()
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
