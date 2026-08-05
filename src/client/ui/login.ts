import { ApiError, login } from "../api.ts"
import { el, errorMessage } from "./dom.ts"
import { isMobile } from "./theme.ts"

type RateLimitBody = { readonly retryAfterSeconds?: number }

const DEFAULT_RETRY_AFTER_SECONDS = 30

/** DESIGN.md 5.11: mono countdown, announced at start and end only. */
function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${String(secs).padStart(2, "0")}`
}

export function renderLogin(root: HTMLElement, onSuccess: () => void): void {
  const input = el("input", {
    class: "field__input",
    id: "password",
    type: "password",
    autocomplete: "current-password",
    required: true,
    "aria-describedby": "login-msg",
  })
  const message = el("p", { class: "field__msg", id: "login-msg", hidden: true })
  const submit = el("button", { class: "btn btn--primary login__submit", type: "submit" }, [
    "Unlock",
  ])
  const field = el("div", { class: "field" }, [
    el("label", { class: "field__label", for: "password" }, ["Password"]),
    input,
    message,
  ])
  const form = el("form", { class: "login__card", novalidate: true }, [
    el("h1", { class: "login__title" }, ["web-terminal"]),
    field,
    submit,
    el("p", { class: "login__note" }, [
      "Terminal output is rendered to a canvas and is not fully screen-reader accessible.",
    ]),
  ])
  root.replaceChildren(el("main", { class: "login" }, [form]))

  let countdownTimer: ReturnType<typeof setInterval> | undefined

  const setMessage = (text: string, tone: "error" | "warning", assertive: boolean): void => {
    message.hidden = false
    message.textContent = text
    message.dataset["tone"] = tone
    message.setAttribute("role", assertive ? "alert" : "status")
  }

  const clearMessage = (): void => {
    message.hidden = true
    message.textContent = ""
    field.removeAttribute("data-invalid")
    input.removeAttribute("aria-invalid")
  }

  const showInvalid = (): void => {
    field.dataset["invalid"] = "true"
    input.setAttribute("aria-invalid", "true")
    setMessage("Incorrect password.", "error", true)
    input.focus()
    input.select()
  }

  const startRateLimit = (seconds: number): void => {
    let remaining = Math.max(1, seconds)
    submit.disabled = true
    const tick = (): void => {
      setMessage(`Too many attempts. Try again in ${formatCountdown(remaining)}.`, "warning", false)
      if (remaining <= 0) {
        if (countdownTimer !== undefined) clearInterval(countdownTimer)
        countdownTimer = undefined
        submit.disabled = false
        clearMessage()
        return
      }
      remaining -= 1
    }
    tick()
    countdownTimer = setInterval(tick, 1000)
  }

  const handleFailure = (error: unknown): void => {
    if (error instanceof ApiError) {
      if (error.status === 429) {
        const body: RateLimitBody = error.body ?? {}
        startRateLimit(body.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS)
        return
      }
      if (error.status === 401) {
        showInvalid()
        return
      }
    }
    setMessage(errorMessage(error, "Connection failed."), "error", true)
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault()
    if (submit.disabled) return
    clearMessage()
    // Loading: input goes readonly, never disabled (DESIGN.md 5.2).
    submit.disabled = true
    submit.setAttribute("aria-busy", "true")
    input.readOnly = true
    void login(input.value)
      .then(onSuccess)
      .catch(handleFailure)
      .finally(() => {
        submit.removeAttribute("aria-busy")
        input.readOnly = false
        if (countdownTimer === undefined) submit.disabled = false
      })
  })

  // Not autofocused below --bp-md: forcing the keyboard open is hostile (DESIGN.md 5.11).
  if (!isMobile()) input.focus()
}
