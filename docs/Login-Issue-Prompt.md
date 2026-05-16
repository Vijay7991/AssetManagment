# AssetHub Login Issue — Debug Prompt

Copy the block below and paste it into a new chat (with Claude, ChatGPT, or any AI assistant) when you need help diagnosing the login failure.

---

## The prompt

```
I'm running AssetHub, a self-hosted multi-tenant asset management app, locally
via Docker Compose. I can't log in anymore. I need help diagnosing why.

# Stack
- .NET 9 API (container: assethub-api, listens on :8080 inside, mapped to host :5080)
- Next.js 15 web (container: assethub-web, :3000)
- PostgreSQL 16 (container: assethub-db, :5432)
- Caddy reverse proxy (container: assethub-caddy, :80 and :443) — fronts the
  web app at https://localhost and proxies /api/* to the API
- MailHog for dev SMTP

# What's working
- All five containers are Up (verified with `docker compose ps`)
- API booted cleanly: logs show "Database schema verified." and
  "Now listening on: http://[::]:8080"
- No errors in `docker compose logs api`
- DB container is healthy
- I had a working account before — this used to log in fine
- I have NOT changed JWT_SECRET or POSTGRES_PASSWORD in .env

# What's wrong
- I open https://localhost in the browser
- Login page loads fine
- I enter my credentials and click login
- I get an error message: "Not found"
- The API logs show NO incoming request when I click login — the request
  is not reaching the API at all

# What I think is happening
The 404 is being generated upstream of the API. Probable causes:
1. Caddy isn't routing /api/* to the API service anymore (most likely —
   I recently edited the Caddyfile while setting up a Cloudflare Tunnel)
2. The Next.js web app is calling a wrong URL for login
3. A route the web expects on the API no longer exists

# What I need from you
1. Tell me what to check first, in order of likelihood
2. Help me read my Caddyfile (I'll paste it) and confirm /api/* routing is correct
3. Help me interpret the browser Network tab for the failed login request
4. Give me the exact fix once we identify the cause

# Diagnostic info I can collect on request
- Full Caddyfile contents (`type "D:\Projects\Asset Managment\caddy\Caddyfile"`)
- Browser Network tab — exact Request URL, Status Code, Response body
- docker-compose.yml contents
- API endpoint list (from Swagger or source)
- Web app's login page source and API client config

Ask me for whichever pieces you need.
```

---

## How to use this prompt

1. Copy everything inside the triple backticks above
2. Paste into a fresh chat with any AI assistant
3. The assistant will ask for specific diagnostics — collect them and paste back
4. Iterate until the cause is identified and fixed

## Why this prompt is structured this way

- **Stack section** — gives the assistant the architecture without making it guess
- **What's working** — rules out the common "did you restart it?" / "check the logs" responses
- **What's wrong** — precise symptom (a 404, not a credentials error or 500)
- **What I think is happening** — shows you've already narrowed it down; saves the assistant from re-deriving it
- **What I need** — explicit ask, so the response is actionable not abstract
- **Diagnostic info available** — signals you're willing to do the legwork and what's easy to collect
