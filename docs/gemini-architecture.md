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

Cloud Run should call Gemini through Vertex AI using the attached service account:

```bash
GOOGLE_CLOUD_PROJECT=[PROJECT-ID]
GOOGLE_CLOUD_LOCATION=global
GEMINI_MODEL=gemini-3.1-pro-preview
```

For local development, run `gcloud auth login` or set `VERTEX_ACCESS_TOKEN`. `GEMINI_API_KEY` and `GOOGLE_API_KEY` are retained as local fallback options when no Vertex project is configured.

## Vertex AI Card Images

The card-front image pipeline uses Vertex AI Gemini image generation as a build-time asset step, not from the browser. The same script uses Gemini text generation for the back-of-card Olympic and Paralympic panel copy, so readable panel text is generated from aggregate facts rather than hard-coded into the UI.

```bash
npm run generate:card-panels -- --states CO
npm run generate:card-panels -- --all
```

The script reads:

- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION`, defaulting to `global`
- `CARD_IMAGE_MODEL`, defaulting to `gemini-3-pro-image-preview`
- `CARD_COPY_MODEL`, defaulting to `GEMINI_MODEL` or `gemini-3.1-pro-preview`

Authentication can come from `VERTEX_ACCESS_TOKEN`, `GOOGLE_OAUTH_ACCESS_TOKEN`, `gcloud auth print-access-token`, or `GOOGLE_APPLICATION_CREDENTIALS`. The generator defaults to `VERTEX_AUTH_MODE=auto`: if the JSON key belongs to the same project as `GOOGLE_CLOUD_PROJECT`, it uses that service account for Vertex; if the key belongs to a different Firebase project, it keeps the key for Firebase Admin and uses local `gcloud` auth for Vertex. `FIREBASE_PROJECT_ID` can explicitly select the Firestore/Firebase project when it differs from the Vertex project. `VERTEX_AUTH_MODE=gcloud` or `VERTEX_AUTH_MODE=service_account` can force either Vertex auth path.

Generated assets are stored in `public/assets/card-panels` with a `manifest.json` that maps each state to separate Olympic and Paralympic image-panel files plus Gemini-generated `cardBackCopy` for each panel. The prompts require faceless abstract sport-category illustrations, no athlete likeness, no embedded text, and no protected marks.

Firebase-backed generation is also available:

```bash
npm run generate:card-panels:firebase -- --states CA
npm run generate:card-panels:firebase -- --all
```

That mode uploads PNG images to Firebase Storage under `card-panels/{promptVersion}/{stateCode}/`, writes image metadata and Gemini-generated card-back copy to Firestore docs at `cardPanels/{STATE}` and `cardPanels/{STATE}/panels/{program}`, and updates the local manifest to use Firebase download URLs.

The in-app **Gemini State Briefing** is generated at runtime through `POST /api/gemini/state-briefing`. In Cloud Run, that route calls Vertex AI with the attached service account. It uses the selected state card, including generated panel copy when present, then validates the output before display.

## Production Deployment

Cloud Run serves the built React app from `dist` and the Node API routes from `server.js`.

Recommended deployment:

```bash
npm run deploy:cloud-run
```

The deployment script creates or reuses the `common-ground-vertex` service account, grants `roles/aiplatform.user`, and attaches that identity to Cloud Run. No service-account JSON key should be deployed.

The same service account is also granted `roles/datastore.user` for Firestore and `roles/storage.objectAdmin` for Firebase Storage/Cloud Storage access. Set `FIREBASE_STORAGE_BUCKET` in `.env` to grant Storage access at bucket scope instead of broad project scope when the bucket already exists.
