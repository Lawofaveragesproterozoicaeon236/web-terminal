import { chromium } from "playwright"

const browser = await chromium.launch()
// trusted surface: must land straight in the terminal, no login form
const p1 = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await p1.goto("http://127.0.0.1:7812")
await p1.waitForTimeout(2500)
const trusted = await p1.evaluate(() => ({
  loginForm: !!document.querySelector("#password"),
  terminalCanvas: !!document.querySelector(".terminal canvas"),
}))
await p1.screenshot({ path: "qa-evidence/s2-tailnet-passwordless.png" })
// public surface: must show login
const p2 = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await p2.goto("http://127.0.0.1:7811")
await p2.waitForTimeout(1500)
const pub = await p2.evaluate(() => ({
  loginForm: !!document.querySelector("#password"),
  terminalCanvas: !!document.querySelector(".terminal canvas"),
}))
console.log("TRUSTED:", JSON.stringify(trusted))
console.log("PUBLIC:", JSON.stringify(pub))
await browser.close()
