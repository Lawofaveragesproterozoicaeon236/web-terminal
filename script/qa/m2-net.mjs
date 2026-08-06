import { chromium } from "playwright"

const browser = await chromium.launch()
const page = await browser.newPage()
const reqs = []
page.on("response", (res) => {
  if (/woff|font|SymbolsNerd/i.test(res.url())) reqs.push(`${res.status()} ${res.url()}`)
})
await page.goto("http://127.0.0.1:7815")
await page.fill("#password", "qa-password-123")
await page.click("button[type=submit]")
await page.waitForSelector(".terminal canvas", { timeout: 15000 })
await page.waitForTimeout(2000)
console.log("font requests:", JSON.stringify(reqs, null, 1))
// what does the served CSS say?
const cssUrl = await page.evaluate(() => {
  for (const s of Array.from(document.styleSheets)) {
    try {
      for (const r of Array.from(s.cssRules)) {
        if (r.cssText.includes("SymbolsNerd")) return r.cssText
      }
    } catch {}
  }
  return "not found in live stylesheets"
})
console.log("live @font-face rule:", cssUrl)
await browser.close()
