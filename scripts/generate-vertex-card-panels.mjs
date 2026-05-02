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
const PROMPT_VERSION = "common-ground-card-panel-v2-full-bleed";

const STATE_PALETTE_STORIES = {
  AZ: {
    name: "Sonoran Dusk",
    olympic: "desert rose, saguaro green, canyon clay, violet dusk, pale sand highlights",
    paralympic: "copper orange, prickly-pear magenta, deep indigo shade, warm limestone, dry-sun gold",
    atmosphere: "arid heat, high plateau shadow, desert sky, and angular canyon light"
  },
  CA: {
    name: "Pacific Heat",
    olympic: "Pacific teal, kelp green, sun gold, marine blue, and fog white",
    paralympic: "sunset coral, terracotta sand, deep ocean teal, warm violet shadow, and cream highlights",
    atmosphere: "coast-to-mountain energy, desert warmth, ocean haze, and cinematic California light"
  },
  CO: {
    name: "Alpine Signal",
    olympic: "glacier blue, spruce navy, snow white, ice cyan, and high-altitude silver",
    paralympic: "copper alpenglow, warm granite, pale peach snow, deep pine, and muted amber",
    atmosphere: "mountain elevation, winter light, and crisp outdoor terrain"
  },
  FL: {
    name: "Gulf Current",
    olympic: "clear aqua, mangrove green, shell white, citrus yellow, and lagoon blue",
    paralympic: "coral pink, sea-grass olive, warm sand, flamingo peach, and storm-cloud teal",
    atmosphere: "coastal humidity, peninsula water access, and bright subtropical motion"
  },
  HI: {
    name: "Volcanic Reef",
    olympic: "reef turquoise, volcanic charcoal, hibiscus red-orange, seafoam, and sunlit cloud white",
    paralympic: "lava copper, orchid purple, warm sand, deep ocean blue, and tropical green",
    atmosphere: "ocean exposure, volcanic terrain, island wind, and radiant tropical light"
  },
  MN: {
    name: "North Lake Ice",
    olympic: "lake blue, pine green, frost white, steel gray, and winter-sky cyan",
    paralympic: "cranberry red, birch cream, deep lake navy, muted moss, and copper cabin light",
    atmosphere: "cold lakes, snow texture, northern forests, and clean winter air"
  },
  NY: {
    name: "Metro Harbor",
    olympic: "harbor blue, slate graphite, taxi gold, river silver, and clean white light",
    paralympic: "brick red, copper night glow, deep teal, concrete gray, and cream highlights",
    atmosphere: "urban infrastructure, Atlantic water, four-season contrast, and editorial city energy"
  },
  TX: {
    name: "Hill Country Heat",
    olympic: "limestone cream, live-oak green, deep night blue, prairie gold, and gulf teal",
    paralympic: "clay red, mesquite brown, sunset orange, cactus green, and warm sandstone",
    atmosphere: "large-state scale, heat, plains, hill country, and gulf edge"
  },
  UT: {
    name: "Wasatch Clay",
    olympic: "Wasatch blue, salt-flat white, sage green, canyon shadow, and clean snow light",
    paralympic: "red-rock clay, apricot desert, deep plum shade, warm sand, and copper ridge light",
    atmosphere: "mountain elevation, winter access, desert basins, and sculpted terrain"
  },
  VI: {
    name: "Caribbean Current",
    olympic: "Caribbean turquoise, palm green, cloud white, shallow-water cyan, and sunlit sand",
    paralympic: "coral reef, warm shell, deep ultramarine, sunset peach, and tropical shadow",
    atmosphere: "island coastline, ocean access, tropical air, and compact coastal motion"
  },
  WA: {
    name: "Cascade Rain",
    olympic: "Puget Sound blue, evergreen, mist gray, glacier white, and rain-lit cyan",
    paralympic: "cedar copper, salmon coral, storm teal, pale fog, and volcanic charcoal",
    atmosphere: "Pacific coast, wet west climate, Cascade mountains, and layered outdoor depth"
  }
};

const FALLBACK_PALETTE_STORIES = [
  {
    name: "Coastal Current",
    test: /coast|ocean|gulf|atlantic|pacific|sound|water|aquatic|island|peninsula|river/i,
    olympic: "deep coastal blue, sea-glass teal, shell white, wet-sand beige, and foam highlights",
    paralympic: "coral, tide-pool green, warm sand, stormy teal, and sun-washed peach",
    atmosphere: "water access, coastal air, and layered shoreline motion"
  },
  {
    name: "Desert Range",
    test: /desert|dry heat|arid|basin|canyon|plateau|mesa/i,
    olympic: "dusk violet, sage green, pale sand, canyon blue shadow, and sun-bleached white",
    paralympic: "terracotta, copper, desert rose, warm limestone, and deep purple shade",
    atmosphere: "dry terrain, heat shimmer, broad sky, and geometric desert planes"
  },
  {
    name: "Mountain Snow",
    test: /mountain|snow|winter|alpine|elevation|ski|cold/i,
    olympic: "ice blue, pine navy, snow white, slate, and glacier cyan",
    paralympic: "alpenglow peach, copper ridge, warm granite, cream snow, and deep evergreen",
    atmosphere: "high terrain, winter light, and crisp outdoor depth"
  },
  {
    name: "Great Lakes Fieldhouse",
    test: /great lakes|lake|lakes|inland|forest|cold winters/i,
    olympic: "lake blue, pine green, frost white, steel gray, and cool morning light",
    paralympic: "cranberry, birch cream, deep water navy, moss green, and copper warmth",
    atmosphere: "lake air, indoor-outdoor sport access, forests, and clean seasonal contrast"
  },
  {
    name: "Metro Court",
    test: /urban|metro|infrastructure|dense|corridor|city/i,
    olympic: "ink navy, concrete gray, electric cyan, court-line white, and muted gold",
    paralympic: "brick red, copper, asphalt charcoal, teal accent, and warm paper light",
    atmosphere: "city grids, venues, transit rhythm, and editorial sport-card energy"
  },
  {
    name: "Prairie Wind",
    test: /plains|prairie|wind|rolling|grassland|agricultural/i,
    olympic: "prairie gold, sky blue, wheat cream, storm gray, and field green",
    paralympic: "burnt sienna, harvest amber, deep green, warm clay, and dusk violet",
    atmosphere: "open horizon, wind movement, field geometry, and broad-sky rhythm"
  },
  {
    name: "Forest Ridge",
    test: /appalachian|ozark|forest|foothill|ridge|valley|blue ridge/i,
    olympic: "ridge blue, fern green, river white, stone gray, and morning mist",
    paralympic: "moss, copper leaf, warm bark, clay red, and cream fog",
    atmosphere: "wooded terrain, river valleys, ridges, and quiet outdoor depth"
  }
];

const DEFAULT_PALETTE_STORY = {
  name: "Field Atlas",
  olympic: "ink navy, field green, sky blue, warm paper, and clean white highlights",
  paralympic: "moss green, copper, clay, deep blue shadow, and soft cream light",
  atmosphere: "regional geography, sport-card motion, and printed atlas texture"
};

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

    const existingPanel = manifest.states[card.stateCode][program];
    if (!args.force && existingPanel?.url === url && existingPanel.promptVersion === PROMPT_VERSION) {
      console.log(`Skipping ${card.stateCode} ${program}; manifest already points to ${url} with ${PROMPT_VERSION}. Use --force to regenerate.`);
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
      promptVersion: PROMPT_VERSION,
      promptSummary: `${card.stateName} ${program} ${programPanel(card, program).sportFamily}`,
      paletteTheme: paletteStoryForCard(card).name,
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

function paletteStoryForCard(card) {
  const explicitStory = STATE_PALETTE_STORIES[card.stateCode];
  if (explicitStory) return explicitStory;

  const searchText = [
    card.stateName,
    card.geographySnapshot,
    card.climateSignal,
    ...(card.terrainSignals || []),
    card.olympicPanel?.sportFamily,
    card.paralympicPanel?.sportFamily,
    card.sharedTrait?.name,
    card.sharedTrait?.description
  ].filter(Boolean).join(" ");

  return FALLBACK_PALETTE_STORIES.find((story) => story.test.test(searchText)) || DEFAULT_PALETTE_STORY;
}

function buildPrompt(card, program) {
  const panel = programPanel(card, program);
  const paletteStory = paletteStoryForCard(card);
  const palette = paletteStory[program] || paletteStory.olympic;
  const programPhrase = program === "paralympic"
    ? "an adaptive sport-family scene with abstract equipment cues when relevant"
    : "an Olympic sport-family scene with abstract sport movement cues when relevant";

  return `Create one full-bleed 16:9 sports-card illustration artwork for Common Ground, a compliant Team USA x Google Cloud Hackathon prototype.

Artwork role: ${program === "paralympic" ? "Paralympic" : "Olympic"} image artwork for one half of the front of a state discovery card.
State: ${card.stateName}
Sport family: ${panel.sportFamily}
Shared trait: ${card.sharedTrait.name} — ${card.sharedTrait.description}
Geography context: ${card.geographySnapshot}

Visual direction:
- Match a premium collectible atlas sports-card style: clean, polished, modern, lightly dimensional, vector/low-poly illustration.
- Use ${programPhrase}; the figure must be faceless, generic, and non-identifiable.
- Use the state geography as the environment inspiration, not as a performance claim.
- Full-bleed artwork only: the illustration must fill the entire image canvas edge to edge.
- Do not draw an inner card, picture frame, rounded rectangle, border, mat, white margin, inset panel, drop shadow, UI container, poster frame, or card-within-a-card.
- Do not reserve a visible boxed label area. Leave open negative space through composition only, not by drawing a panel or blank rectangle.
- Palette theme: ${paletteStory.name}.
- Program palette: ${palette}.
- Environmental color mood: ${paletteStory.atmosphere}.
- The Olympic and Paralympic panels are siblings on the same card; keep them visually related through the palette theme while giving this panel its own emphasis.
- Do not default to Olympic-as-blue and Paralympic-as-orange. Let the state palette drive the colors, and avoid a political campaign or national-flag color composition.
- Composition: 16:9 landscape artwork, strong central action silhouette, generous clean negative space in the upper-left for an overlaid app label, but no visible label box.
- Style should feel like the supplied Stitch reference: crisp geometric shapes, soft gradients, paper-cut mountain/wave/terrain planes, subtle depth, no photo realism.

Compliance constraints:
- No real athlete likeness, no recognizable face, no athlete names, no jersey numbers, no official uniforms.
- No Olympic rings, Paralympic Agitos, torches, medals, podiums, flags, Team USA logos, LA28 logos, NGB logos, sponsor logos, or brand marks.
- No embedded text, letters, labels, UI chrome, borders, or icons inside the image; the app will overlay labels separately.
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
