import { execFile } from "node:child_process";
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataPath = path.join(rootDir, "public", "data", "state-cards.json");
const outputDir = path.join(rootDir, "public", "assets", "card-panels");
const manifestPath = path.join(outputDir, "manifest.json");

loadDotEnv(path.join(rootDir, ".env"));

const args = parseArgs(process.argv.slice(2));
const project = process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || "global";
const model = process.env.CARD_IMAGE_MODEL || "gemini-3-pro-image-preview";

if (!project) {
  throw new Error("GOOGLE_CLOUD_PROJECT is required. Add it to .env or export it before running this script.");
}

const dataset = JSON.parse(await readFile(dataPath, "utf8"));
const selectedCards = selectCards(dataset.states, args);

if (selectedCards.length === 0) {
  throw new Error("No matching states found. Use --states CO,WA or --all.");
}

await mkdir(outputDir, { recursive: true });

if (args.dryRun) {
  for (const card of selectedCards) {
    for (const program of ["olympic", "paralympic"]) {
      console.log(`\n--- ${card.stateName} ${program} prompt ---\n${buildPrompt(card, program)}\n`);
    }
  }
  process.exit(0);
}

const token = await getAccessToken();
const manifest = await loadManifest();
manifest.model = model;
manifest.location = location;
manifest.updatedAt = new Date().toISOString();
manifest.states ||= {};

for (const card of selectedCards) {
  manifest.states[card.stateCode] ||= {};

  for (const program of ["olympic", "paralympic"]) {
    const filename = `${card.stateCode.toLowerCase()}-${program}.png`;
    const outPath = path.join(outputDir, filename);
    const url = `/assets/card-panels/${filename}`;
    const prompt = buildPrompt(card, program);

    if (!args.force && manifest.states[card.stateCode][program]?.url === url) {
      console.log(`Skipping ${card.stateCode} ${program}; manifest already points to ${url}. Use --force to regenerate.`);
      continue;
    }

    console.log(`Generating ${card.stateName} ${program} panel with ${model}...`);
    const { imageBuffer, mimeType, textParts } = await generateGeminiImage({ token, prompt });
    await writeFile(outPath, imageBuffer);

    manifest.states[card.stateCode][program] = {
      url,
      model,
      mimeType,
      generatedAt: new Date().toISOString(),
      promptVersion: "common-ground-card-panel-v1",
      promptSummary: `${card.stateName} ${program} ${programPanel(card, program).sportFamily}`,
      notes: textParts.join(" ").trim()
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Wrote ${url}`);
  }
}

console.log(`Updated ${path.relative(rootDir, manifestPath)}`);

function parseArgs(argv) {
  const parsed = {
    all: false,
    dryRun: false,
    force: false,
    states: ["CO"]
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--all") parsed.all = true;
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--force") parsed.force = true;
    else if (arg === "--states") parsed.states = String(argv[index += 1] || "").split(",");
    else if (arg.startsWith("--states=")) parsed.states = arg.slice("--states=".length).split(",");
    else throw new Error(`Unknown argument: ${arg}`);
  }

  parsed.states = parsed.states.map((code) => code.trim().toUpperCase()).filter(Boolean);
  return parsed;
}

function selectCards(states, parsedArgs) {
  if (parsedArgs.all) return states;
  const wanted = new Set(parsedArgs.states);
  return states.filter((state) => wanted.has(state.stateCode));
}

function programPanel(card, program) {
  return program === "paralympic" ? card.paralympicPanel : card.olympicPanel;
}

function buildPrompt(card, program) {
  const panel = programPanel(card, program);
  const palette = program === "paralympic"
    ? "warm peach, terracotta, copper, cream, and soft amber shadows"
    : "cool glacier blue, navy, white, pale cyan, and crisp mountain light";
  const programPhrase = program === "paralympic"
    ? "an adaptive sport-family scene with abstract equipment cues when relevant"
    : "an Olympic sport-family scene with abstract sport movement cues when relevant";

  return `Create one rectangular sports-card illustration panel for Common Ground, a compliant Team USA x Google Cloud Hackathon prototype.

Panel role: ${program === "paralympic" ? "Paralympic" : "Olympic"} image panel for the front of a state discovery card.
State: ${card.stateName}
Sport family: ${panel.sportFamily}
Shared trait: ${card.sharedTrait.name} — ${card.sharedTrait.description}
Geography context: ${card.geographySnapshot}

Visual direction:
- Match a premium analyst-dashboard sports-card style: clean, polished, modern, lightly dimensional, vector/low-poly illustration.
- Use ${programPhrase}; the figure must be faceless, generic, and non-identifiable.
- Use the state geography as the environment inspiration, not as a performance claim.
- Palette: ${palette}.
- Composition: 16:9 landscape panel, strong central action silhouette, generous clean negative space in the upper-left for an overlaid UI label.
- Style should feel like the supplied Stitch reference: crisp geometric shapes, soft gradients, paper-cut mountain/wave/terrain planes, subtle depth, no photo realism.

Compliance constraints:
- No real athlete likeness, no recognizable face, no athlete names, no jersey numbers, no official uniforms.
- No Olympic rings, Paralympic Agitos, torches, medals, podiums, flags, Team USA logos, LA28 logos, NGB logos, sponsor logos, or brand marks.
- No embedded text or letters inside the image; the app will overlay labels separately.
- Do not imply geography creates, produces, guarantees, predicts, or proves athletic results.
- No finish times, scores, rankings, medal imagery, or comparison imagery.

Return only the image.`;
}

async function generateGeminiImage({ token, prompt }) {
  const endpoint = vertexEndpoint();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: {
        role: "USER",
        parts: [{ text: prompt }]
      },
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        temperature: 0.75,
        imageConfig: {
          aspectRatio: "16:9"
        }
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE",
          method: "PROBABILITY"
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vertex Gemini image request failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const parts = payload.candidates?.flatMap((candidate) => candidate.content?.parts || []) || [];
  const imagePart = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
  const textParts = parts.map((part) => part.text).filter(Boolean);

  if (!imagePart) {
    throw new Error(`Gemini response did not include an image. Text response: ${textParts.join(" ") || "none"}`);
  }

  const inlineData = imagePart.inlineData || imagePart.inline_data;
  return {
    imageBuffer: Buffer.from(inlineData.data, "base64"),
    mimeType: inlineData.mimeType || inlineData.mime_type || "image/png",
    textParts
  };
}

function vertexEndpoint() {
  const host = location === "global"
    ? "https://aiplatform.googleapis.com"
    : `https://${location}-aiplatform.googleapis.com`;
  return `${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
}

async function loadManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    return {
      model,
      location,
      updatedAt: null,
      states: {}
    };
  }
}

async function getAccessToken() {
  if (process.env.VERTEX_ACCESS_TOKEN) return process.env.VERTEX_ACCESS_TOKEN;
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) return process.env.GOOGLE_OAUTH_ACCESS_TOKEN;

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return accessTokenFromServiceAccount(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }

  try {
    const { stdout } = await execFileAsync("gcloud", ["auth", "print-access-token"], { timeout: 15000 });
    const token = stdout.trim();
    if (token) return token;
  } catch {
    // Fall through to the explicit setup error below.
  }

  throw new Error([
    "No Vertex authentication was found.",
    "Set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON file, set VERTEX_ACCESS_TOKEN,",
    "or install/login with gcloud so `gcloud auth print-access-token` works."
  ].join(" "));
}

async function accessTokenFromServiceAccount(credentialsPath) {
  const credentials = JSON.parse(await readFile(credentialsPath, "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  }));
  const unsigned = `${header}.${claims}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(credentials.private_key);
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Service account token exchange failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  if (!payload.access_token) throw new Error("Service account token exchange did not return access_token.");
  return payload.access_token;
}

function base64Url(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function loadDotEnv(envPath) {
  let raw = "";
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
