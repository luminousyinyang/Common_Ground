#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${GOOGLE_CLOUD_REGION:-us-central1}"
VERTEX_LOCATION="${GOOGLE_CLOUD_LOCATION:-global}"
FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-$PROJECT_ID}"
FIREBASE_STORAGE_BUCKET="${FIREBASE_STORAGE_BUCKET:-}"
SERVICE_NAME="${CLOUD_RUN_SERVICE:-common-ground}"
REPOSITORY="${ARTIFACT_REGISTRY_REPOSITORY:-common-ground}"
SERVICE_ACCOUNT_NAME="${CLOUD_RUN_SERVICE_ACCOUNT_NAME:-common-ground-vertex}"
SERVICE_ACCOUNT_EMAIL="${CLOUD_RUN_SERVICE_ACCOUNT:-${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-3.1-pro-preview}"
CLOUD_RUN_MIN_INSTANCES="${CLOUD_RUN_MIN_INSTANCES:-1}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE_NAME}:latest"

if [[ -z "$PROJECT_ID" ]]; then
  echo "Missing GOOGLE_CLOUD_PROJECT. Add it to .env or run: gcloud config set project PROJECT_ID" >&2
  exit 1
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI is required for deployment." >&2
  exit 1
fi

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")"
CLOUD_BUILD_SERVICE_ACCOUNT="${CLOUD_BUILD_SERVICE_ACCOUNT:-${PROJECT_NUMBER}-compute@developer.gserviceaccount.com}"

echo "Deploying ${SERVICE_NAME} to Cloud Run"
echo "Project: ${PROJECT_ID}"
echo "Firebase project: ${FIREBASE_PROJECT_ID}"
echo "Region: ${REGION}"
echo "Runtime service account: ${SERVICE_ACCOUNT_EMAIL}"
echo "Cloud Build service account: ${CLOUD_BUILD_SERVICE_ACCOUNT}"
echo "Minimum warm instances: ${CLOUD_RUN_MIN_INSTANCES}"
echo "Image: ${IMAGE}"

npm run build

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  firebase.googleapis.com \
  firebaserules.googleapis.com \
  firebasestorage.googleapis.com \
  firestore.googleapis.com \
  identitytoolkit.googleapis.com \
  storage.googleapis.com \
  --project "$PROJECT_ID"

if [[ "$FIREBASE_PROJECT_ID" != "$PROJECT_ID" ]]; then
  gcloud services enable \
    firebase.googleapis.com \
    firebaserules.googleapis.com \
    firebasestorage.googleapis.com \
    firestore.googleapis.com \
    identitytoolkit.googleapis.com \
    storage.googleapis.com \
    --project "$FIREBASE_PROJECT_ID"
fi

if ! gcloud iam service-accounts describe "$SERVICE_ACCOUNT_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" \
    --project "$PROJECT_ID" \
    --display-name="Common Ground Vertex"
fi

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/aiplatform.user" \
  --condition=None \
  >/dev/null

gcloud projects add-iam-policy-binding "$FIREBASE_PROJECT_ID" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/datastore.user" \
  --condition=None \
  >/dev/null

gcloud projects add-iam-policy-binding "$FIREBASE_PROJECT_ID" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/firebaseauth.admin" \
  --condition=None \
  >/dev/null

for role in \
  roles/cloudbuild.builds.builder \
  roles/storage.objectViewer \
  roles/storage.objectCreator \
  roles/artifactregistry.writer \
  roles/logging.logWriter
do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${CLOUD_BUILD_SERVICE_ACCOUNT}" \
    --role="$role" \
    --condition=None \
    >/dev/null
done

if [[ -n "$FIREBASE_STORAGE_BUCKET" ]]; then
  gcloud storage buckets add-iam-policy-binding "gs://${FIREBASE_STORAGE_BUCKET}" \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/storage.objectAdmin" \
    --project "$FIREBASE_PROJECT_ID" \
    >/dev/null
else
  gcloud projects add-iam-policy-binding "$FIREBASE_PROJECT_ID" \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/storage.objectAdmin" \
    --condition=None \
    >/dev/null
fi

if ! gcloud artifacts repositories describe "$REPOSITORY" \
  --project "$PROJECT_ID" \
  --location "$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPOSITORY" \
    --project "$PROJECT_ID" \
    --repository-format=docker \
    --location "$REGION" \
    --description="Common Ground Cloud Run images"
fi

BUILD_CONFIG="$(mktemp)"
trap 'rm -f "$BUILD_CONFIG"' EXIT
cat > "$BUILD_CONFIG" <<CLOUDBUILD
steps:
  - name: gcr.io/cloud-builders/docker
    args:
      - build
      - --build-arg
      - VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY:-}
      - --build-arg
      - VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN:-}
      - --build-arg
      - VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID:-$FIREBASE_PROJECT_ID}
      - --build-arg
      - VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET:-$FIREBASE_STORAGE_BUCKET}
      - --build-arg
      - VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID:-}
      - --build-arg
      - VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID:-}
      - -t
      - ${IMAGE}
      - .
images:
  - ${IMAGE}
CLOUDBUILD

gcloud builds submit . \
  --project "$PROJECT_ID" \
  --config "$BUILD_CONFIG"

gcloud run deploy "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "$IMAGE" \
  --service-account "$SERVICE_ACCOUNT_EMAIL" \
  --allow-unauthenticated \
  --min "$CLOUD_RUN_MIN_INSTANCES" \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=${VERTEX_LOCATION},GEMINI_MODEL=${GEMINI_MODEL},FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID},FIREBASE_STORAGE_BUCKET=${FIREBASE_STORAGE_BUCKET},NODE_ENV=production"

gcloud run services describe "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format="value(status.url)"
