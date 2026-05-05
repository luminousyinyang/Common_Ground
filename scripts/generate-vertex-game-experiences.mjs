import { execFile } from "node:child_process";
import { createHash, createSign, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import https from "node:https";
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
const imageModel = process.env.GAME_IMAGE_MODEL || "gemini-3.1-flash-image-preview";
const textModel = process.env.GAME_COPY_MODEL || process.env.GEMINI_MODEL || "gemini-3.1-pro-preview";
const vertexAuthMode = normalizeVertexAuthMode(process.env.VERTEX_AUTH_MODE || "auto");
const imageMaxAttempts = positiveInteger(process.env.GAME_IMAGE_MAX_ATTEMPTS, 3);
const imageRetryDelayMs = positiveInteger(process.env.GAME_IMAGE_RETRY_DELAY_MS, 5000);
const imageRequestTimeoutMs = positiveInteger(process.env.GAME_IMAGE_REQUEST_TIMEOUT_MS, 900000);
const textRequestTimeoutMs = positiveInteger(process.env.GAME_COPY_REQUEST_TIMEOUT_MS, 120000);
const GAME_EXPERIENCE_VERSION = "common-ground-game-experience-v2-style-references";

let firebaseClientsPromise;

const GAME_TYPES = {
  reaction_grid: "Fast target recognition and quick spatial decisions.",
  cadence_keeper: "Steady rhythm, pacing, and repeated timing.",
  precision_trace: "Controlled cursor path, line reading, and fine movement choices.",
  focus_hold: "Staying inside a moving zone while conditions shift.",
  pattern_scout: "Watching, remembering, and replaying a short visual route."
};

const STYLE_REFERENCE_IMAGE_PATHS = [
  path.join(rootDir, "public", "assets", "graphics", "Fan Challenges.png"),
  path.join(rootDir, "public", "assets", "graphics", "Interactive Map.png"),
  path.join(rootDir, "public", "assets", "graphics", "State Cards.png"),
  path.join(rootDir, "public", "assets", "graphics", "Hero Graphic.png"),
  path.join(rootDir, "public", "assets", "graphics", "Login Graphic.png")
];

const GAME_BACKGROUND_STYLE = [
  "Rough printed fan-atlas illustration style, like a screen-printed editorial sports graphic.",
  "Visible paper grain, speckled risograph noise, dry-brush edges, and slightly imperfect ink coverage across every color block.",
  "Soft rounded organic hills, waves, courts, tracks, roads, equipment shapes, and route cues with fuzzy painted borders.",
  "Flat layered shapes with gentle depth, not glossy 3D, not photoreal, not clean corporate vector art, and not a literal city-map screenshot.",
  "Palette language: powder blue, cornflower, deep denim, forest green, olive, sage, cream paper, coral red-orange, sun gold, muted teal, rust, and charcoal ink.",
  "Compositions should feel hand-made and collectible, with large simplified sport-object and geography shapes, not tiny dense wallpaper detail.",
  "The app overlays gameplay UI on top, so keep the central play area softer and lower contrast while letting richer detail live near the edges.",
  "The image itself must be pure artwork: no words, letters, numbers, symbols, logos, badges, borders, map labels, or UI."
].join("\n- ");

if (!project) {
  throw new Error("GOOGLE_CLOUD_PROJECT is required. Add it to .env or export it before running this script.");
}

const dataset = JSON.parse(await readFile(dataPath, "utf8"));
const selectedCards = selectCards(dataset.states, args);
if (!selectedCards.length) throw new Error("No matching states found. Use --states CA,AL,KS,MT,HI or --all.");
if (args.noLocal && !args.firebase) throw new Error("--no-local requires --firebase so generated images still have a storage target.");

await mkdir(outputDir, { recursive: true });

const token = args.dryRun ? null : await getAccessToken();
const manifest = await loadManifest();
manifest.gameExperienceModel = textModel;
manifest.gameBackgroundModel = imageModel;
manifest.gameExperienceVersion = GAME_EXPERIENCE_VERSION;
manifest.location = location;
manifest.updatedAt = new Date().toISOString();
manifest.states ||= {};

const assignedTypes = new Set();

for (const card of selectedCards) {
  manifest.states[card.stateCode] ||= {};
  const existing = manifest.states[card.stateCode].gameExperience;
  if (!args.force && existing?.version === GAME_EXPERIENCE_VERSION && existing?.background?.url) {
    assignedTypes.add(existing.challengeType);
    console.log(`Skipping ${card.stateCode} game experience; manifest already has ${GAME_EXPERIENCE_VERSION}. Use --force to regenerate.`);
    continue;
  }

  let assignment;
  const assignmentPrompt = buildGameAssignmentPrompt(card, [...assignedTypes]);
  if (args.reuseAssignment && existing?.challengeType) {
    assignment = assignmentFromExistingGameExperience(existing, card);
    console.log(`Reusing existing ${card.stateName} ${assignment.challengeType} game assignment.`);
  } else {
    if (args.dryRun) {
      console.log(`\n--- ${card.stateName} Gemini game assignment prompt ---\n${assignmentPrompt}\n`);
      continue;
    }

    console.log(`Generating ${card.stateName} game assignment with ${textModel}...`);
    assignment = validateGameAssignment(await generateGeminiJsonWithRetry({
      token,
      prompt: assignmentPrompt,
      modelName: textModel,
      label: `${card.stateName} game assignment`,
      timeoutMs: textRequestTimeoutMs
    }));
  }
  assignedTypes.add(assignment.challengeType);

  const prompt = buildGameBackgroundPrompt(card, assignment);
  if (args.dryRun) {
    console.log(`\n--- ${card.stateName} Gemini game background prompt ---\n${prompt}\n`);
    continue;
  }

  if (args.metadataOnly) {
    const record = gameExperienceRecord({ card, assignment, prompt, background: null });
    manifest.states[card.stateCode].gameExperience = record;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    if (args.firebase) await writeGameExperienceToFirebase({ card, record, prompt });
    continue;
  }

  console.log(`Generating ${card.stateName} ${assignment.challengeType} background with ${imageModel}...`);
  const { imageBuffer, mimeType } = await generateGeminiImageWithRetry({ token, prompt, label: `${card.stateName} game background` });
  const filename = `${card.stateCode.toLowerCase()}-${assignment.challengeType}-game.png`;
  const localUrl = `/assets/card-panels/${filename}`;
  const outPath = path.join(outputDir, filename);
  if (!args.noLocal) {
    await writeFile(outPath, imageBuffer);
    console.log(`Wrote ${localUrl}`);
  }

  const localBackground = {
    url: localUrl,
    localUrl: args.noLocal ? null : localUrl,
    mimeType,
    model: imageModel,
    location,
    promptHash: hashText(prompt)
  };

  const background = args.firebase
    ? await saveGameBackgroundToFirebase({ card, assignment, imageBuffer, mimeType, prompt, localBackground })
    : localBackground;

  const record = gameExperienceRecord({ card, assignment, prompt, background });
  manifest.states[card.stateCode].gameExperience = record;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  if (args.firebase) await writeGameExperienceToFirebase({ card, record, prompt });
}

console.log(`Updated ${path.relative(rootDir, manifestPath)}`);

function parseArgs(argv) {
  const parsed = {
    all: false,
    dryRun: false,
    firebase: false,
    force: false,
    metadataOnly: false,
    noLocal: false,
    reuseAssignment: false,
    states: ["CA", "AL", "KS", "MT", "HI"]
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--all") parsed.all = true;
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--firebase") parsed.firebase = true;
    else if (arg === "--force") parsed.force = true;
    else if (arg === "--metadata-only") parsed.metadataOnly = true;
    else if (arg === "--no-local") parsed.noLocal = true;
    else if (arg === "--reuse-assignment") parsed.reuseAssignment = true;
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

function buildGameAssignmentPrompt(card, assignedTypes) {
  return `You are Gemini choosing the best safe fan mini-game for a Common Ground state card.

Choose the game type from the allowed list. The selected game must be based on the aggregate state card story, featured sports, sport-family themes, shared trait, and geography notes. Do not hardcode by state name.
This generation batch is intended to demonstrate all five game types across several state cards. If a listed unused game still fits this card, prefer an unused type. Do not choose a poor fit just for variety.

Allowed game types:
${Object.entries(GAME_TYPES).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

Already used in this batch:
${assignedTypes.length ? assignedTypes.join(", ") : "none"}

Compliance:
- No athlete names, likenesses, finish times, scores, rankings, medals, or athlete comparisons.
- Do not call the game a test, assessment, diagnostic, talent measure, training simulation, or athlete baseline.
- Use fan-appreciation language only.
- Do not imply geography causes athletic outcomes.

Return valid JSON with:
- challengeType: one allowed game type
- sharedTraitName: short fan-facing trait name, 2-5 words
- sharedTraitDescription: one sentence about the trait
- gameName: short challenge title
- gameIntro: one safe fan-facing sentence
- visualTheme: 2-5 words for the game background
- backgroundPromptBrief: one sentence describing the visual background concept
- darkModeNotes: one short note for dark UI readability
- lightModeNotes: one short note for light UI readability
- whyThisGame: one sentence explaining the fit
- complianceWarnings: []

State card:
${JSON.stringify({
  stateCode: card.stateCode,
  stateName: card.stateName,
  geographySnapshot: card.geographySnapshot,
  climateSignal: card.climateSignal,
  terrainSignals: card.terrainSignals,
  sharedTrait: card.sharedTrait,
  cardStory: stripRecordCounts(card.cardStory),
  olympicPanel: {
    sportFamily: card.olympicPanel?.sportFamily,
    primarySportTag: displaySportName(card.olympicPanel?.primarySportTag),
    topSportTags: (card.olympicPanel?.topSportTags || []).map(displaySportName),
    sportTagCandidates: (card.olympicPanel?.sportTagCandidates || []).slice(0, 6).map(sanitizeSportCandidate)
  },
  paralympicPanel: {
    sportFamily: card.paralympicPanel?.sportFamily,
    primarySportTag: displaySportName(card.paralympicPanel?.primarySportTag),
    topSportTags: (card.paralympicPanel?.topSportTags || []).map(displaySportName),
    sportTagCandidates: (card.paralympicPanel?.sportTagCandidates || []).slice(0, 6).map(sanitizeSportCandidate)
  }
}, null, 2)}`;
}

function sanitizeSportCandidate(candidate) {
  if (!candidate) return candidate;
  const { recordCount, ...rest } = candidate;
  return rest;
}

function stripRecordCounts(value) {
  if (Array.isArray(value)) return value.map(stripRecordCounts);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "recordCount" && key !== "featuredSportRecordCount")
      .map(([key, entry]) => [key, stripRecordCounts(entry)])
  );
}

function validateGameAssignment(raw) {
  const assignment = typeof raw === "string" ? JSON.parse(normalizeJsonText(raw)) : raw;
  if (!GAME_TYPES[assignment.challengeType]) throw new Error(`Invalid challengeType: ${assignment.challengeType}`);

  const required = ["sharedTraitName", "sharedTraitDescription", "gameName", "gameIntro", "visualTheme", "backgroundPromptBrief", "whyThisGame"];
  for (const field of required) {
    if (!String(assignment[field] || "").trim()) throw new Error(`Missing game assignment field: ${field}`);
  }

  const text = collectStrings(assignment).join(" ");
  const banned = [
    /\bathlete names?\b/i,
    /\blikeness/i,
    /\bfinish times?\b/i,
    /\bscores?\b/i,
    /\brankings?\b/i,
    /\bmedals?\b/i,
    /\bdiagnostic\b/i,
    /\bassessment\b/i,
    /\btalent\b/i,
    /\btrain like\b/i,
    /\bbaseline\b/i,
    /\bguarantee/i,
    /\bproduces? athletes\b/i,
    /\bcreates? athletes\b/i
  ];
  const warnings = banned.filter((pattern) => pattern.test(text)).map(String);
  if (warnings.length) throw new Error(`Unsafe game assignment language: ${warnings.join(", ")}`);
  return {
    ...assignment,
    complianceWarnings: Array.isArray(assignment.complianceWarnings) ? assignment.complianceWarnings : []
  };
}

function assignmentFromExistingGameExperience(existing, card) {
  return validateGameAssignment({
    challengeType: existing.challengeType,
    sharedTraitName: existing.sharedTraitName || card.sharedTrait?.name,
    sharedTraitDescription: existing.sharedTraitDescription || card.sharedTrait?.description,
    gameName: existing.gameName || card.cardStory?.fanChallengeName,
    gameIntro: existing.gameIntro || `Try a short fan challenge inspired by ${String(existing.sharedTraitName || card.sharedTrait?.name || "state sync").toLowerCase()}.`,
    visualTheme: existing.theme || card.cardStory?.themeName || card.sharedTrait?.name || "State game surface",
    backgroundPromptBrief: existing.backgroundPromptBrief || `A rough fan-atlas mini-game backdrop built around ${existing.theme || card.cardStory?.themeName || card.sharedTrait?.name || "the state card theme"}.`,
    darkModeNotes: existing.darkModeNotes || "",
    lightModeNotes: existing.lightModeNotes || "",
    whyThisGame: existing.whyThisGame || "This mini-game matches the shared trait and state card story.",
    complianceWarnings: existing.complianceWarnings || []
  });
}

function buildGameBackgroundPrompt(card, assignment) {
  const gameSpecificDirection = gameBackgroundDirectionForAssignment(assignment);

  return `Create one polished 16:9 background illustration for a Common Ground mini-game surface.

State: ${card.stateName}
Game type: ${assignment.challengeType}
Game name: ${assignment.gameName}
Visual theme: ${assignment.visualTheme}
Background concept: ${assignment.backgroundPromptBrief}
State geography context: ${card.geographySnapshot}
Featured Olympic sport context: ${displaySportName(card.olympicPanel?.primarySportTag || card.olympicPanel?.topSportTags?.[0] || card.olympicPanel?.sportFamily)}
Featured Paralympic sport context: ${displaySportName(card.paralympicPanel?.primarySportTag || card.paralympicPanel?.topSportTags?.[0] || card.paralympicPanel?.sportFamily)}

Visual direction:
- Match the premium rough collectible fan-atlas style already used by the Common Ground state card panels, suitable behind an interactive browser game.
- Style extraction target:
- ${GAME_BACKGROUND_STYLE}
- Attached style references are for visual style only. Extract the rough grain, muted green/blue/coral palette, rounded organic sports collage, fuzzy ink edges, and soft editorial composition. Do not copy words, letters, "USA" text, exact layouts, card shapes, map shapes, logos, symbols, or any specific graphic element.
- Full-bleed 16:9 environmental background only.
- Use abstract state geography, terrain, weather, water/road/court/path cues, featured-sport surface language, and subtle game-mechanic motifs.
- Prefer a graphic collage of large simplified shapes over scenic panorama, literal map tiles, street-grid rendering, or dense low-detail wallpaper.
- Game-specific composition:
- ${gameSpecificDirection}
- It must work in both light and dark UI modes: keep the center playable, with rich detail at edges and soft contrast in the middle.
- No text, no letters, no labels, no icons, no buttons, no UI panels, no map labels, no scoreboards.
- No real people, faces, athlete likeness, official uniforms, jersey numbers, celebrity likeness, or individual-identifying features.
- No Olympic rings, Paralympic Agitos, torches, medals, podiums, flags, Team USA logos, LA28 logos, sponsor logos, or brand marks.
- No finish times, scores, rankings, medals, or comparison imagery.
- Do not imply geography causes or guarantees athletic results.
- Avoid a flat wallpaper look: include layered depth, subtle paper grain, and a clear visual rhythm that supports ${assignment.challengeType}.

Return only the image.`;
}

function gameBackgroundDirectionForAssignment(assignment) {
  if (assignment.challengeType === "cadence_keeper") {
    return [
      "Cadence Keeper background must be a rhythm-playing surface, not a general state landscape.",
      "The rendered game places a large circular tap pad in the center and a horizontal progress meter near the lower part of the board. Compose around those overlays.",
      "Keep the central 45% of the image quiet, low-contrast, and mostly open: a calm circular water basin or soft seafoam halo with subtle concentric ripple rings only.",
      "Use repeated, evenly spaced wave crests, current bands, pool-lane curves, and soft pulse arcs to communicate steady tempo and timing.",
      "For California Waterline Rhythm, make the core scene an abstract pool-meets-Pacific water surface: shallow coastal current bands, lane-rope rhythm, water-polo passing arcs, and a gentle shoreline curve.",
      "Place richer sport and state cues only near the far edges: small abstract water-polo ball/goal shapes, distant coast/mountain/desert silhouettes, or transition-route curves. Keep them away from the tap pad and progress meter.",
      "Avoid literal roads, city street grids, map tiles, scenic postcard mountains, busy swimmers, full people, and sports equipment directly under the progress meter.",
      "The result should feel like the user is tapping on the steady pulse of water: readable rhythm first, California context second."
    ].join("\n- ");
  }

  if (assignment.challengeType === "reaction_grid") {
    return [
      "Reaction Grid background should support quick target recognition.",
      "Keep a calm center and arrange edge detail as broad field/court zones, peripheral motion cues, and clean contrast blocks.",
      "Avoid tiny repeating texture or target-like decorations that could be confused with interactive cells."
    ].join("\n- ");
  }

  if (assignment.challengeType === "precision_trace") {
    return [
      "Precision Trace background should support a clear path-following interaction.",
      "Use one broad implied route, river line, court line, wind line, or contour path that flows across the board without competing with the actual trace path.",
      "Keep intersections, sharp clutter, and high-contrast marks away from the center play route."
    ].join("\n- ");
  }

  if (assignment.challengeType === "focus_hold") {
    return [
      "Focus Hold background should support sustained attention on a moving zone.",
      "Use soft concentric fields, calm terrain bands, or target-range atmosphere around the edges while leaving the center spacious.",
      "Avoid many bullseyes, dots, or small high-contrast objects that could compete with the focus zone."
    ].join("\n- ");
  }

  if (assignment.challengeType === "pattern_scout") {
    return [
      "Pattern Scout background should support route memory.",
      "Use broad landmark-like shapes at edges and subtle pathway rhythm, while keeping the cell grid area low contrast.",
      "Avoid decorative symbols that look like clickable sequence cells."
    ].join("\n- ");
  }

  return "Keep the board-specific playable area quiet and use richer state/story detail only at the edges.";
}

function gameExperienceRecord({ card, assignment, prompt, background }) {
  return {
    version: GAME_EXPERIENCE_VERSION,
    source: "gemini",
    stateCode: card.stateCode,
    stateName: card.stateName,
    challengeType: assignment.challengeType,
    sharedTraitName: assignment.sharedTraitName,
    sharedTraitDescription: assignment.sharedTraitDescription,
    gameName: assignment.gameName,
    gameIntro: assignment.gameIntro,
    theme: assignment.visualTheme,
    backgroundPromptBrief: assignment.backgroundPromptBrief,
    whyThisGame: assignment.whyThisGame,
    darkModeNotes: assignment.darkModeNotes,
    lightModeNotes: assignment.lightModeNotes,
    background,
    assignmentModel: textModel,
    backgroundModel: background?.model || imageModel,
    location,
    generatedAt: new Date().toISOString(),
    promptHash: hashText(prompt),
    complianceWarnings: assignment.complianceWarnings || []
  };
}

async function generateGeminiJsonWithRetry({ token, prompt, modelName, label, timeoutMs }) {
  let lastError;
  for (let attempt = 1; attempt <= imageMaxAttempts; attempt += 1) {
    try {
      return await generateGeminiJson({ token, prompt, modelName, timeoutMs });
    } catch (error) {
      lastError = error;
      if (attempt >= imageMaxAttempts) throw error;
      const delayMs = imageRetryDelayMs * attempt;
      console.warn(`${label} request failed on attempt ${attempt}/${imageMaxAttempts}: ${error.message}`);
      console.warn(`Retrying in ${Math.round(delayMs / 1000)}s...`);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

async function generateGeminiJson({ token, prompt, modelName, timeoutMs }) {
  const response = await postVertexJson(vertexEndpointForModel(modelName), {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: {
      contents: [{ role: "USER", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.35
      }
    },
    timeoutMs
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Vertex Gemini JSON request failed: ${response.statusCode} ${response.bodyText}`);
  }

  const payload = JSON.parse(response.bodyText);
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
  return JSON.parse(normalizeJsonText(text));
}

async function generateGeminiImageWithRetry({ token, prompt, label }) {
  let lastError;
  for (let attempt = 1; attempt <= imageMaxAttempts; attempt += 1) {
    try {
      return await generateGeminiImage({ token, prompt });
    } catch (error) {
      lastError = error;
      if (!isRetryableVertexImageError(error) || attempt >= imageMaxAttempts) throw error;
      const delayMs = imageRetryDelayMs * attempt;
      console.warn(`${label} image request failed on attempt ${attempt}/${imageMaxAttempts}: ${error.message}`);
      console.warn(`Retrying in ${Math.round(delayMs / 1000)}s...`);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

async function generateGeminiImage({ token, prompt }) {
  const styleReferenceParts = loadStyleReferenceParts();
  const response = await postVertexJson(vertexEndpointForModel(imageModel), {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: {
      contents: {
        role: "USER",
        parts: [
          { text: prompt },
          ...styleReferenceParts
        ]
      },
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        temperature: 0.72,
        imageConfig: { aspectRatio: "16:9" }
      }
    },
    timeoutMs: imageRequestTimeoutMs
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    const error = new Error(`Vertex Gemini image request failed: ${response.statusCode} ${response.bodyText}`);
    error.status = response.statusCode;
    error.retryable = [408, 409, 425, 429, 499, 500, 502, 503, 504].includes(response.statusCode);
    throw error;
  }

  const payload = JSON.parse(response.bodyText);
  const parts = payload.candidates?.flatMap((candidate) => candidate.content?.parts || []) || [];
  const imagePart = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
  if (!imagePart) {
    const text = parts.map((part) => part.text).filter(Boolean).join(" ");
    throw new Error(`Gemini response did not include an image. Text response: ${text || "none"}`);
  }
  const inlineData = imagePart.inlineData || imagePart.inline_data;
  return {
    imageBuffer: Buffer.from(inlineData.data, "base64"),
    mimeType: inlineData.mimeType || inlineData.mime_type || "image/png"
  };
}

function loadStyleReferenceParts() {
  if (String(process.env.GAME_STYLE_REFERENCES || "1").trim() === "0") return [];

  const parts = [{
    text: "Style reference images follow. Use them only for art direction: rough grain, muted colors, rounded organic sports collage, fuzzy edges, and editorial composition. Do not copy text, letters, exact map/card layouts, logos, or specific content from the references."
  }];

  for (const referencePath of STYLE_REFERENCE_IMAGE_PATHS) {
    try {
      parts.push({
        inlineData: {
          mimeType: mimeTypeForImage(referencePath),
          data: readFileSync(referencePath).toString("base64")
        }
      });
    } catch {
      // References are optional; the text prompt still carries the style direction.
    }
  }

  return parts;
}

function mimeTypeForImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

async function saveGameBackgroundToFirebase({ card, assignment, imageBuffer, mimeType, prompt, localBackground }) {
  const { bucket, firebaseProjectId, storageBucket } = await getFirebaseClients();
  const objectName = `${card.stateCode.toLowerCase()}-${assignment.challengeType}.png`;
  const storagePath = `game-backgrounds/${GAME_EXPERIENCE_VERSION}/${card.stateCode.toLowerCase()}/${objectName}`;
  const downloadToken = randomUUID();
  const file = bucket.file(storagePath);

  await file.save(imageBuffer, {
    resumable: false,
    metadata: {
      cacheControl: "public, max-age=31536000, immutable",
      contentType: mimeType,
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
        commonGroundStateCode: card.stateCode,
        commonGroundChallengeType: assignment.challengeType,
        commonGroundPromptVersion: GAME_EXPERIENCE_VERSION,
        commonGroundPromptHash: hashText(prompt)
      }
    }
  });

  const downloadUrl = firebaseDownloadUrl(storageBucket, storagePath, downloadToken);
  console.log(`Uploaded ${card.stateCode} game background to gs://${storageBucket}/${storagePath}`);
  return {
    ...localBackground,
    url: downloadUrl,
    downloadUrl,
    storageBucket,
    firebaseProjectId,
    storagePath,
    gsUri: `gs://${storageBucket}/${storagePath}`
  };
}

async function writeGameExperienceToFirebase({ card, record, prompt }) {
  const { db, FieldValue } = await getFirebaseClients();
  const stateDoc = db.collection("cardPanels").doc(card.stateCode);
  await stateDoc.set({
    stateCode: card.stateCode,
    stateName: card.stateName,
    gameExperience: record,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await stateDoc.collection("gameExperience").doc("current").set({
    ...record,
    prompt,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  console.log(`Wrote Firestore cardPanels/${card.stateCode}/gameExperience/current`);
}

async function postVertexJson(endpoint, { headers, body, timeoutMs }) {
  const url = new URL(endpoint);
  const bodyText = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: url.hostname,
      method: "POST",
      path: `${url.pathname}${url.search}`,
      port: url.port || 443,
      protocol: url.protocol,
      headers: {
        ...headers,
        "Content-Length": Buffer.byteLength(bodyText)
      }
    }, (response) => {
      response.setEncoding("utf8");
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          bodyText: chunks.join(""),
          headers: response.headers,
          statusCode: response.statusCode || 0
        });
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`Vertex request timed out after ${Math.round(timeoutMs / 1000)}s.`)));
    request.on("error", reject);
    request.write(bodyText);
    request.end();
  });
}

function isRetryableVertexImageError(error) {
  if (error?.retryable) return true;
  const message = String(error?.message || "");
  const causeCode = String(error?.cause?.code || "");
  return ["fetch failed", "Headers Timeout", "UND_ERR_HEADERS_TIMEOUT", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN"].some((token) => message.includes(token) || causeCode.includes(token));
}

async function loadManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    return { states: {} };
  }
}

async function getFirebaseClients() {
  if (firebaseClientsPromise) return firebaseClientsPromise;
  firebaseClientsPromise = (async () => {
    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
    if (!storageBucket) throw new Error("FIREBASE_STORAGE_BUCKET is required when using --firebase. Add it to .env.");
    const { applicationDefault, getApps, initializeApp } = await import("firebase-admin/app");
    const { FieldValue, getFirestore } = await import("firebase-admin/firestore");
    const { getStorage } = await import("firebase-admin/storage");
    const credentials = readGoogleApplicationCredentials();
    const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || credentials?.project_id || project;
    const app = getApps()[0] || initializeApp({
      credential: applicationDefault(),
      projectId: firebaseProjectId,
      storageBucket
    });
    return {
      bucket: getStorage(app).bucket(storageBucket),
      db: getFirestore(app),
      firebaseProjectId,
      FieldValue,
      storageBucket
    };
  })();
  return firebaseClientsPromise;
}

async function getAccessToken() {
  if (process.env.VERTEX_ACCESS_TOKEN) return process.env.VERTEX_ACCESS_TOKEN;
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) return process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  const credentials = readGoogleApplicationCredentials();
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const credentialsProjectMatchesVertex = credentials?.project_id && credentials.project_id === project;
  if (vertexAuthMode === "service_account") return accessTokenFromServiceAccount(credentialsPath);
  if (credentialsPath && credentialsProjectMatchesVertex) return accessTokenFromServiceAccount(credentialsPath);
  try {
    return await accessTokenFromGcloud();
  } catch (error) {
    if (credentialsPath) return accessTokenFromServiceAccount(credentialsPath);
    throw error;
  }
}

async function accessTokenFromGcloud() {
  const attempts = [
    { command: "gcloud", args: ["auth", "print-access-token"] },
    { command: "/opt/homebrew/bin/gcloud", args: ["auth", "print-access-token"] },
    { command: "/usr/local/bin/gcloud", args: ["auth", "print-access-token"] },
    {
      command: "/bin/zsh",
      args: ["-lc", "source \"$(brew --prefix 2>/dev/null)/share/google-cloud-sdk/path.zsh.inc\" 2>/dev/null || true; export CLOUDSDK_PYTHON=${CLOUDSDK_PYTHON:-/usr/bin/python3}; gcloud auth print-access-token"]
    }
  ];
  for (const attempt of attempts) {
    try {
      const { stdout } = await execFileAsync(attempt.command, attempt.args, { timeout: 15000 });
      const token = stdout.trim();
      if (token) return token;
    } catch {
      // Try next auth strategy.
    }
  }
  throw new Error("gcloud auth was not available for Vertex. Run `gcloud auth login` or set VERTEX_ACCESS_TOKEN.");
}

async function accessTokenFromServiceAccount(credentialsPath) {
  if (!credentialsPath) throw new Error("GOOGLE_APPLICATION_CREDENTIALS is required for service-account Vertex auth.");
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
  const unsignedJwt = `${header}.${claims}`;
  const signature = createSign("RSA-SHA256").update(unsignedJwt).sign(credentials.private_key);
  const jwt = `${unsignedJwt}.${base64Url(signature)}`;
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) throw new Error(`Service-account token request failed: ${response.status} ${await response.text()}`);
  const payload = await response.json();
  return payload.access_token;
}

function vertexEndpointForModel(modelName) {
  const host = location === "global" ? "https://aiplatform.googleapis.com" : `https://${location}-aiplatform.googleapis.com`;
  return `${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(modelName)}:generateContent`;
}

function readGoogleApplicationCredentials() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) return null;
  try {
    return JSON.parse(readFileSync(credentialsPath, "utf8"));
  } catch {
    return null;
  }
}

function loadDotEnv(filePath) {
  let content = "";
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function normalizeVertexAuthMode(rawMode) {
  const mode = String(rawMode || "auto").trim().toLowerCase();
  if (["auto", "gcloud", "service_account"].includes(mode)) return mode;
  throw new Error(`Invalid VERTEX_AUTH_MODE="${rawMode}". Use "auto", "gcloud", or "service_account".`);
}

function normalizeJsonText(text) {
  return String(text || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
}

function collectStrings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(collectStrings);
  return [];
}

function displaySportName(value) {
  const text = String(value || "").trim();
  if (/^paratriathlon$/i.test(text)) return "Para triathlon";
  return text;
}

function firebaseDownloadUrl(bucketName, storagePath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;
}

function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

function base64Url(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buffer.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function positiveInteger(rawValue, fallback) {
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
