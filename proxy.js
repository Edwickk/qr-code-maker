import { createHmac, timingSafeEqual } from "node:crypto";
import { next } from "@vercel/functions";

const LOGIN_PATH = "/__auth/login";
const LOGOUT_PATH = "/__auth/logout";
const COOKIE_NAME = "__Host-qr-studio-session";
const SESSION_SECONDS = 60 * 60 * 12;

function response(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      ...headers,
    },
  });
}

function json(body, status = 200, headers = {}) {
  return response(JSON.stringify(body), status, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
}

function loginPage(configured) {
  const message = configured
    ? "Enter the shared password to open QR Studio."
    : "The login is not configured yet. Add SITE_PASSWORD and SITE_SESSION_SECRET to this Vercel project’s environment variables, then redeploy.";
  const disabled = configured ? "" : "disabled";

  return response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#f5f7fb" />
    <title>Private workspace · QR Studio</title>
    <style>
      :root { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; background: #f5f7fb; font-synthesis: none; text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased; }
      * { box-sizing: border-box; }
      body { display: grid; place-items: center; min-width: 320px; min-height: 100vh; margin: 0; padding: 24px; background: radial-gradient(ellipse at 50% 0%, #eeedff 0, #f5f7fb 50%, #f5f7fb 100%); }
      .backdrop { position: fixed; inset: 0; display: grid; place-items: center; padding: 24px; background: #18213a24; backdrop-filter: blur(5px); }
      .dialog { width: min(100%, 420px); padding: 32px; border: 1px solid #e8ebf2; border-radius: 18px; background: #fff; box-shadow: 0 24px 80px #17213a24; }
      .brand { display: flex; align-items: center; gap: 11px; margin-bottom: 27px; }
      .brand-icon { display: grid; width: 42px; height: 42px; place-items: center; border-radius: 13px; color: white; background: linear-gradient(140deg,#756df4,#5046c9); box-shadow: 0 6px 15px #635bdf35; }
      .brand-name { font-size: 17px; font-weight: 800; letter-spacing: -.5px; }
      .brand-name span { color: #655cde; }
      .brand-subtitle { margin-top: 3px; color: #9aa2b2; font-size: 9px; font-weight: 700; letter-spacing: 1.35px; }
      .eyebrow { display: flex; align-items: center; gap: 7px; margin-bottom: 9px; color: #6259d7; font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
      h1 { margin: 0; color: #17213a; font-size: 25px; letter-spacing: -.8px; }
      .description { margin: 9px 0 23px; color: #81899b; font-size: 13px; line-height: 1.6; }
      label { display: block; margin-bottom: 8px; color: #4c566c; font-size: 11px; font-weight: 700; }
      input { width: 100%; height: 45px; padding: 0 12px; border: 1px solid #dfe4ed; border-radius: 8px; outline: 0; color: #26324a; font: inherit; font-size: 13px; }
      input:focus { border-color: #8179eb; box-shadow: 0 0 0 3px #635bdf18; }
      button { width: 100%; height: 43px; margin-top: 14px; border: 0; border-radius: 8px; color: #fff; background: #635bdf; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
      button:hover:not(:disabled) { background: #5148ce; }
      button:disabled { cursor: not-allowed; opacity: .6; }
      .status { min-height: 18px; margin: 11px 0 0; color: #c34b5a; font-size: 11px; line-height: 1.5; }
      .privacy { display: flex; align-items: center; gap: 7px; margin-top: 20px; padding-top: 15px; border-top: 1px solid #edf0f5; color: #8490a2; font-size: 10px; }
      .privacy svg { flex: none; color: #3d9a79; }
      @media (max-width: 480px) { .dialog { padding: 25px 21px; } }
    </style>
  </head>
  <body>
    <main class="backdrop">
      <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="title">
        <div class="brand">
          <span class="brand-icon" aria-hidden="true"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v2m-3 3h3v2m-6-2v2"/></svg></span>
          <span><span class="brand-name">QR<span>Studio</span></span><span class="brand-subtitle">PRIVATE WORKSPACE</span></span>
        </div>
        <div class="eyebrow"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Restricted access</div>
        <h1 id="title">Welcome back</h1>
        <p class="description">${message}</p>
        <form id="login-form">
          <label for="password">Workspace password</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required autofocus ${disabled} />
          <button id="submit" type="submit" ${disabled}>Continue to QR Studio</button>
          <p id="status" class="status" role="status" aria-live="polite"></p>
        </form>
        <div class="privacy"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></svg> Your workspace is protected by a private login.</div>
      </section>
    </main>
    <script>
      const form = document.getElementById("login-form");
      const input = document.getElementById("password");
      const button = document.getElementById("submit");
      const status = document.getElementById("status");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        button.disabled = true;
        button.textContent = "Checking…";
        status.textContent = "";
        try {
          const result = await fetch("/__auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ password: input.value }),
          });
          const body = await result.json();
          if (!result.ok) throw new Error(body.error || "Unable to log in.");
          window.location.replace("/");
        } catch (error) {
          status.textContent = error.message || "Could not reach the login service. Try again.";
          input.select();
          button.disabled = false;
          button.textContent = "Continue to QR Studio";
        }
      });
    </script>
  </body>
</html>`,
    200,
    { "Content-Type": "text/html; charset=utf-8" }
  );
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function safeEqual(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function sign(expiration, secret) {
  return createHmac("sha256", secret).update(expiration).digest("base64url");
}

function hasValidSession(request, secret) {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookie = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return false;

  const token = cookie.slice(COOKIE_NAME.length + 1);
  const separator = token.indexOf(".");
  if (separator < 1) return false;

  const expiration = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!/^\d+$/.test(expiration) || Number(expiration) <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  return safeEqual(signature, sign(expiration, secret));
}

function authCookie(token, maxAge) {
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

export default async function proxy(request) {
  const { pathname } = new URL(request.url);
  const password = process.env.SITE_PASSWORD;
  const sessionSecret = process.env.SITE_SESSION_SECRET;
  const configured = Boolean(password && sessionSecret);

  if (pathname === LOGIN_PATH) {
    if (request.method !== "POST") {
      return json({ error: "Method not allowed." }, 405, { Allow: "POST" });
    }
    if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
    if (!configured) return json({ error: "The private login is not configured yet." }, 503);

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 2048) return json({ error: "Invalid request." }, 413);

    let submittedPassword;
    try {
      ({ password: submittedPassword } = await request.json());
    } catch {
      return json({ error: "Invalid request." }, 400);
    }

    if (typeof submittedPassword !== "string" || !safeEqual(submittedPassword, password)) {
      return json({ error: "That password didn’t match. Please try again." }, 401);
    }

    const expiration = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
    const token = `${expiration}.${sign(expiration, sessionSecret)}`;
    return json({ success: true }, 200, {
      "Set-Cookie": authCookie(token, SESSION_SECONDS),
    });
  }

  if (pathname === LOGOUT_PATH) {
    if (request.method !== "POST") {
      return json({ error: "Method not allowed." }, 405, { Allow: "POST" });
    }
    if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
    return json({ success: true }, 200, { "Set-Cookie": authCookie("", 0) });
  }

  if (!configured) return loginPage(false);
  if (!hasValidSession(request, sessionSecret)) return loginPage(true);

  return next();
}
