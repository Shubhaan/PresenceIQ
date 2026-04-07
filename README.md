# PresenceIQ

PresenceIQ is a student-focused daily effectiveness dashboard that combines productivity and recovery into one score.

## What is included

- A responsive static dashboard built with HTML, CSS, and JavaScript
- A dynamic PresenceIQ scoring engine
- Burnout risk detection based on high study load and weak recovery
- Digital hygiene tracking for learning time versus passive screen time
- AI-style nudges based on the current day state
- Optional Firebase Auth stub for sign-in only
- Optional Vercel API route for public Ollama-backed AI suggestions

## Run locally

Open `index.html` in a browser.

## Firebase scope

Keep Firebase limited to authentication only. No Firestore, Hosting, or backend persistence is required for this version.

## Firebase Auth setup

1. Open `firebase-config.js`.
2. Replace the placeholder values with your Firebase web app config.
3. In the Firebase console, enable Google sign-in under Authentication.
4. Add your local origin to the authorized domains list if needed.
5. Reload `index.html` and use the sign-in panel.

## Vercel frontend deployment

PresenceIQ's frontend is ready to deploy to Vercel as a static site.

1. Push this repo to GitHub.
2. Import the repo into Vercel.
3. Keep the framework preset as `Other`.
4. Set the root directory to the project root.
5. Deploy.

The included [vercel.json](C:\Users\shubh\OneDrive\Pictures\Documents\Playground\vercel.json) uses Vercel's project configuration format and enables `cleanUrls`, which Vercel documents for static HTML routing. Source: [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json).

## Vercel AI route setup

PresenceIQ can use a Vercel API route for AI suggestions. The route proxies requests to an external Ollama server.

1. Deploy the frontend repo to Vercel.
2. In Vercel project settings, add these environment variables:
   `OLLAMA_BASE_URL`
   `OLLAMA_MODEL`
   `PRESENCEIQ_API_KEY`
3. In `firebase-config.js`, set:
   `aiApiBaseUrl` to `""` if the frontend and API are on the same Vercel project.
   `aiApiKey` to the same value as `PRESENCEIQ_API_KEY`.
4. Deploy an external Ollama server on a VPS, GPU box, or another machine reachable from Vercel.
5. Use the `Refresh AI` button in the dashboard to fetch live AI suggestions.

The Vercel API endpoint is `POST /api/suggestions`.

Important:

- The Vercel function is only a proxy layer.
- Ollama itself should run outside Vercel.
- Vercel documents function duration and memory limits, so it is not the right place for a persistent model server. Source: [Vercel Functions limits](https://vercel.com/docs/functions/limitations)
- Ollama documents exposing its server with `OLLAMA_HOST` and using a proxy or tunnel when needed. Source: [Ollama FAQ](https://docs.ollama.com/faq)

## How the score works

PresenceIQ combines productivity and recovery signals into one score:

```text
Score = (Study x 0.4) + (Sleep x 0.3) + (Steps x 0.2) - (SocialMedia x 0.1)
```

The frontend also adds:

- A learning screen-time bonus
- A mood modifier
- Burnout detection based on overwork and weak recovery
- Exam Mode reweighting for mental clarity

## Good next steps

1. Add rate limiting and stronger auth to the Vercel AI route before public launch.
2. Deploy and secure the external Ollama server.
3. Add a 7-day trend chart for score, sleep, and burnout risk.
4. Let users save multiple daily snapshots in local storage.
