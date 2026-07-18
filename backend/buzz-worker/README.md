# Zonnie buzz worker — one-time setup (~5 minutes, free)

Anonymous aggregate check-in counters for "terrace buzz" (community Phase B).
Free tier covers this many times over (100k requests/day).

## Andy's steps

1. Create a free Cloudflare account at https://dash.cloudflare.com/sign-up
   (email + password, no card needed).
2. In a terminal, from this folder (`SunBae/backend/buzz-worker`):

   ```powershell
   npx wrangler login          # opens the browser, click Allow
   npx wrangler kv namespace create BUZZ
   ```

   The second command prints an `id = "..."` line — paste that id into
   `wrangler.toml` replacing `PASTE_KV_NAMESPACE_ID_HERE`. Then:

   ```powershell
   npx wrangler deploy
   ```

   The deploy prints your worker URL, something like
   `https://zonnie-buzz.<your-subdomain>.workers.dev`.

3. Tell Claude the URL (or paste it into `src/lib/buzz.ts` as
   `BUZZ_API_URL`). Claude flips the flag and ships the OTA — the feature
   lights up in the app with no store release.

## What it stores (privacy)

Aggregate counters only: per-terrace weekly + all-time check-in counts.
The device id is used ONLY for a 24-hour dedupe key that auto-expires —
after a day nothing links any device to any check-in. No accounts, no
names, no coordinates, no per-user records.

## Smoke test after deploy

```powershell
curl -X POST https://<worker-url>/checkin -H "Content-Type: application/json" -d '{"terraceId": 1, "device": "test-device-0000"}'
curl https://<worker-url>/buzz/1
```

Expect `{"week":1,"total":1,"counted":true}` then `{"week":1,"total":1}`.
