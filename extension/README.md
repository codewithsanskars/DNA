# SWFS Sourcer: Chrome extension

The extension replaces the **"Add to SWFS" bookmarklet**. Open any LinkedIn profile and the side panel reads it. You can then add the person to the SWFS talent database, optionally linked to a role, in one click.

| | Bookmarklet | SWFS Sourcer |
|---|---|---|
| Fields captured | Name, URL, contact info (if the overlay is open) | Name, headline, location, photo, current role, full experience, education, skills, languages, certifications, years of experience, contact info |
| Contact info | Recruiter must open the overlay first | One click: opens, reads and closes the overlay |
| AI | — | Portal's AI (OpenAI or Ollama) extracts the full profile into structured fields |
| Duplicates | Checked after you land in the portal | Checked live, with "Add existing to role" |
| Role fit | — | Live **JD match %** with matched and missing skills (same scorer as the portal) |
| Photo | — | Imported automatically |
| Workflow | New tab, re-enter details, save | Stays on LinkedIn, saves without leaving |

## Install (developer mode)

1. Go to `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this `extension/` folder.
3. Pin **SWFS Sourcer** and click it. The side panel opens.
4. Click **Connect to SWFS** and sign in with an SWFS staff (admin) account. The portal hands the extension a 30-day token.

The default portal is `http://localhost:5173` (Vite dev server, proxies `/api`). For production, open **Settings** in the side panel (gear icon), set the portal URL, and allow the permission prompt.

## How it works

```
LinkedIn tab ── content/linkedin.js ──(scrape on request)──► side panel ── REST ──► SWFS API
                                                             │
SWFS portal /extension/connect ── content/portal-bridge.js ──┘ (token via postMessage → background)
```

- `src/content/linkedin.js` reads the DOM **only when the panel asks**. Nothing is crawled in the background. It also adds a floating "Add to SWFS" button on `/in/` pages.
- `src/content/portal-bridge.js` runs only on the portal's `/extension/*` pages. It relays the token from `/extension/connect` to the background worker, which checks that the sender matches the configured portal origin.
- `src/sidepanel/` is the UI (plain ES modules, no build step). All scraped text is rendered with `textContent`.
- `src/lib/api.js` calls the portal API: `/candidates`, `/candidates/duplicates`, `/ai/parse-resume/text`, `/ai/match-preview`, `/candidates/:id/photo`, `/candidates/:id/link-job`.

Backend pieces added for the extension: `POST /api/auth/extension-token` (admin only, 30-day JWT with `aud: swfs-extension`), `POST /api/ai/match-preview`, and CORS for `chrome-extension://` origins. Every call still requires the bearer token.

## Notes

- LinkedIn changes its markup often. If fields stop filling, AI extraction (on by default) usually still recovers them from the page text. Selectors live at the top of each parser in `linkedin.js`.
- Only use this on profiles you're allowed to view, in line with LinkedIn's terms. It reads one profile at a time, on a recruiter's click, exactly as shown to them.
- Packaging for the Chrome Web Store: zip the folder contents (manifest at the zip root).
