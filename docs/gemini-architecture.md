# Gemini and Google Cloud Architecture

Common Ground keeps Gemini calls server-side. The browser never receives a Gemini API key.

## Local Development

- `npm run dev` starts the Vite app on `http://127.0.0.1:5173`.
- `npm run api` starts the Node API/static server on `http://127.0.0.1:3000`.
- Vite proxies `/api` requests to the API server during development.
- If no Gemini key is configured, the app returns compliance-safe fallback copy.

## API Routes

- `POST /api/gemini/state-briefing`
- `POST /api/gemini/game-reflection`
- `GET /api/states`
- `GET /api/state/:stateCode`

## Gemini Model

Default state-briefing model:

```text
gemini-3.1-pro-preview
```

Override with:

```bash
GEMINI_MODEL=gemini-3.1-pro-preview
```

Configure the API key on the server with `GEMINI_API_KEY` or `GOOGLE_API_KEY`.

## Vertex AI Card Images

The card-front image pipeline uses Vertex AI Gemini image generation as a build-time asset step, not from the browser.

```bash
npm run generate:card-panels -- --states CO
npm run generate:card-panels -- --all
```

The script reads:

- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION`, defaulting to `global`
- `CARD_IMAGE_MODEL`, defaulting to `gemini-3-pro-image-preview`

Authentication can come from `GOOGLE_APPLICATION_CREDENTIALS`, `VERTEX_ACCESS_TOKEN`, `GOOGLE_OAUTH_ACCESS_TOKEN`, or `gcloud auth print-access-token`.

Generated assets are stored in `public/assets/card-panels` with a `manifest.json` that maps each state to separate Olympic and Paralympic image-panel files. The prompts require faceless abstract sport-category illustrations, no athlete likeness, no embedded text, and no protected marks.

## Production Deployment

Cloud Run serves the built React app from `dist` and the Node API routes from `server.js`.

Recommended deployment:

```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/common-ground
gcloud run deploy common-ground \
  --image gcr.io/PROJECT_ID/common-ground \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_MODEL=gemini-3.1-pro-preview
```

Store API keys in Secret Manager or Cloud Run environment configuration.
