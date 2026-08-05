import { ApiError, checkAuthed, login } from "./api.ts"
import { createTerminalApp } from "./terminal.ts"

const appRoot = document.getElementById("app")
if (appRoot === null) throw new Error("missing #app root")
const app: HTMLElement = appRoot

function renderLogin(onSuccess: () => void): void {
  app.innerHTML = `
    <main class="login">
      <form id="login-form" class="login-card">
        <h1>web-terminal</h1>
        <input id="password" type="password" autocomplete="current-password" placeholder="Password" required />
        <button type="submit">Unlock</button>
        <p id="login-error" class="error" hidden></p>
      </form>
    </main>`
  const form = document.getElementById("login-form")
  const input = document.getElementById("password")
  const errorEl = document.getElementById("login-error")
  if (
    !(form instanceof HTMLFormElement) ||
    !(input instanceof HTMLInputElement) ||
    errorEl === null
  )
    return
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    void login(input.value)
      .then(onSuccess)
      .catch((error: unknown) => {
        errorEl.hidden = false
        errorEl.textContent =
          error instanceof ApiError
            ? error.status === 429
              ? "Too many attempts — wait a moment."
              : "Wrong password."
            : "Connection failed."
      })
  })
}

async function renderApp(): Promise<void> {
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <span class="brand">web-terminal</span>
        <span id="status" class="status" data-state="connecting">connecting</span>
        <span id="latency" class="latency"></span>
      </header>
      <div id="terminal" class="terminal"></div>
    </div>`
  const container = document.getElementById("terminal")
  const status = document.getElementById("status")
  const latency = document.getElementById("latency")
  if (container === null || status === null || latency === null) return
  await createTerminalApp(
    container,
    { background: "#0b0d12", foreground: "#d8dee9" },
    {
      onState: (state) => {
        status.dataset["state"] = state
        status.textContent = state
      },
      onLatency: (ms) => {
        latency.textContent = `${ms}ms`
      },
      onTitle: (title) => {
        document.title = title === "" ? "web-terminal" : title
      },
    },
  )
}

async function boot(): Promise<void> {
  if (await checkAuthed()) {
    await renderApp()
  } else {
    renderLogin(() => void renderApp())
  }
}

void boot()
