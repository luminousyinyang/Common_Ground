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
const model = process.env.CARD_IMAGE_MODEL || "gemini-3-pro-image-preview";
const cardCopyModel = process.env.CARD_COPY_MODEL || process.env.GEMINI_MODEL || "gemini-3.1-pro-preview";
const vertexAuthMode = normalizeVertexAuthMode(process.env.VERTEX_AUTH_MODE || "auto");
const imageMaxAttempts = positiveInteger(process.env.CARD_IMAGE_MAX_ATTEMPTS, 3);
const imageRetryDelayMs = positiveInteger(process.env.CARD_IMAGE_RETRY_DELAY_MS, 5000);
const imageRequestTimeoutMs = positiveInteger(process.env.CARD_IMAGE_REQUEST_TIMEOUT_MS, 900000);
const textRequestTimeoutMs = positiveInteger(process.env.CARD_COPY_REQUEST_TIMEOUT_MS, 120000);
const PROMPT_VERSION = "common-ground-card-panel-v13-track-surface-logic";
const CARD_BACK_COPY_VERSION = "common-ground-card-back-v14-basic-rules";

let firebaseClientsPromise;

const ALLOWED_CARD_BACK_MODULES = new Set([
  "Watch Hook",
  "State Culture",
  "Terrain/Environment Lens",
  "Rules Snapshot",
  "Hidden Skill",
  "Broadcast Moment",
  "Gear/Setup",
  "Pace Shift",
  "Fan Myth-Buster",
  "Sport Family Link",
  "Challenge Link"
]);

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

const ROUGH_FAN_ATLAS_STYLE = [
  "Rough printed fan-atlas illustration style, like a screen-printed editorial sports graphic.",
  "Visible paper grain, speckled risograph noise, dry-brush edges, and slightly imperfect ink coverage across every color block.",
  "Soft rounded organic hills, waves, courts, tracks, roads, and equipment shapes with fuzzy painted borders.",
  "Flat layered shapes with gentle depth, not glossy 3D, not photoreal, not clean corporate vector art.",
  "Palette language: powder blue, cornflower, deep denim, forest green, olive, sage, cream paper, coral red-orange, sun gold, muted teal, rust, and charcoal ink.",
  "Use sports equipment, field markings, water lanes, balls, racquets, wheels, roads, waves, pools, tracks, terrain, and generic faceless sport figures as the subject.",
  "Generic illustrated people are allowed only when they are clearly fictional, faceless, non-identifiable, and stylized as simple geometric paper-cut silhouettes. Use blank heads, no facial features, no hair detail, no skin-detail rendering, no realistic anatomy, no celebrity likeness, no athlete likeness, no official uniforms, no jersey numbers, no names, and no personal detail.",
  "Compositions should feel hand-made and collectible, with playful sport-object placement and state geography woven into the background.",
  "The app overlays all labels and card framing, so the image itself must be pure artwork: no words, letters, numbers, symbols, logos, badges, borders, or UI."
].join("\n- ");

const STYLE_REFERENCE_IMAGE_PATHS = [
  path.join(rootDir, "public", "assets", "graphics", "Fan Challenges.png"),
  path.join(rootDir, "public", "assets", "graphics", "Interactive Map.png"),
  path.join(rootDir, "public", "assets", "graphics", "State Cards.png"),
  path.join(rootDir, "public", "assets", "graphics", "Hero Graphic.png"),
  path.join(rootDir, "public", "assets", "graphics", "Login Graphic.png")
];

if (!project) {
  throw new Error("GOOGLE_CLOUD_PROJECT is required. Add it to .env or export it before running this script.");
}

warnIfCredentialProjectDiffers();

const dataset = JSON.parse(await readFile(dataPath, "utf8"));
const selectedCards = selectCards(dataset.states, args);

if (selectedCards.length === 0) {
  throw new Error("No matching states found. Use --states CO,WA or --all.");
}

if (args.noLocal && !args.firebase) {
  throw new Error("--no-local requires --firebase so generated images still have a storage target.");
}

await mkdir(outputDir, { recursive: true });

if (args.dryRun) {
  for (const card of selectedCards) {
    for (const program of args.programs) {
      console.log(`\n--- ${card.stateName} ${program} image prompt ---\n${buildPrompt(card, program)}\n`);
      console.log(`\n--- ${card.stateName} ${program} Gemini card-back copy prompt ---\n${buildCardBackCopyPrompt(card, program)}\n`);
    }
  }
  process.exit(0);
}

const token = await getAccessToken();
const manifest = await loadManifest();
manifest.model = model;
manifest.cardCopyModel = cardCopyModel;
manifest.location = location;
manifest.updatedAt = new Date().toISOString();
manifest.states ||= {};

for (const card of selectedCards) {
  manifest.states[card.stateCode] ||= {};

  for (const program of args.programs) {
    const filename = `${card.stateCode.toLowerCase()}-${program}.png`;
    const outPath = path.join(outputDir, filename);
    const localUrl = `/assets/card-panels/${filename}`;
    const prompt = buildPrompt(card, program);

    const existingPanel = manifest.states[card.stateCode][program];
    const copyPrompt = buildCardBackCopyPrompt(card, program);
    const cardBackCopy = await getOrGenerateCardBackCopy({
      token,
      card,
      program,
      existingPanel,
      copyPrompt
    });
    const panelMetadata = currentPanelMetadata({ card, program, prompt, copyPrompt, cardBackCopy });
    const currentPrimarySport = panelMetadata.primarySportTag || null;
    const existingPrimarySport = existingPanel?.primarySportTag || null;
    const imageStillMatchesFeaturedSport = currentPrimarySport === existingPrimarySport;
    const alreadyGenerated = imageStillMatchesFeaturedSport && (args.firebase
      ? existingPanel?.storagePath && existingPanel.promptVersion === PROMPT_VERSION
      : existingPanel?.url === localUrl && existingPanel.promptVersion === PROMPT_VERSION);
    if (!args.force && alreadyGenerated) {
      const syncedPanel = {
        ...existingPanel,
        ...panelMetadata,
        localUrl: existingPanel.localUrl ?? (args.noLocal ? null : localUrl),
        mimeType: existingPanel.mimeType || "image/png",
        url: existingPanel.url || localUrl,
        notes: ""
      };
      manifest.states[card.stateCode][program] = syncedPanel;
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      if (args.firebase) {
        await writePanelMetadataToFirebase({ card, program, prompt, panelRecord: syncedPanel });
      }
      console.log(`Skipping ${card.stateCode} ${program}; manifest already has ${PROMPT_VERSION}. Use --force to regenerate.`);
      continue;
    }

    console.log(`Generating ${card.stateName} ${program} panel with ${model}...`);
    const { imageBuffer, mimeType } = await generateGeminiImageWithRetry({
      token,
      prompt,
      label: `${card.stateName} ${program}`
    });

    if (!args.noLocal) {
      await writeFile(outPath, imageBuffer);
      console.log(`Wrote ${localUrl}`);
    }

    const basePanelRecord = {
      url: localUrl,
      localUrl: args.noLocal ? null : localUrl,
      model,
      location,
      mimeType,
      generatedAt: new Date().toISOString(),
      ...panelMetadata,
      notes: ""
    };

    const panelRecord = args.firebase
      ? await savePanelToFirebase({
        card,
        program,
        imageBuffer,
        mimeType,
        prompt,
        panelRecord: basePanelRecord
      })
      : basePanelRecord;

    manifest.states[card.stateCode][program] = panelRecord;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

console.log(`Updated ${path.relative(rootDir, manifestPath)}`);

function parseArgs(argv) {
  const parsed = {
    all: false,
    dryRun: false,
    firebase: false,
    force: false,
    noLocal: false,
    programs: ["olympic", "paralympic"],
    states: ["CO"]
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--all") parsed.all = true;
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--firebase") parsed.firebase = true;
    else if (arg === "--force") parsed.force = true;
    else if (arg === "--no-local") parsed.noLocal = true;
    else if (arg === "--program" || arg === "--programs") parsed.programs = parseProgramList(argv[index += 1]);
    else if (arg.startsWith("--program=")) parsed.programs = parseProgramList(arg.slice("--program=".length));
    else if (arg.startsWith("--programs=")) parsed.programs = parseProgramList(arg.slice("--programs=".length));
    else if (arg === "--states") parsed.states = String(argv[index += 1] || "").split(",");
    else if (arg.startsWith("--states=")) parsed.states = arg.slice("--states=".length).split(",");
    else throw new Error(`Unknown argument: ${arg}`);
  }

  parsed.states = parsed.states.map((code) => code.trim().toUpperCase()).filter(Boolean);
  return parsed;
}

function parseProgramList(value) {
  const allowed = new Set(["olympic", "paralympic"]);
  const programs = String(value || "")
    .split(",")
    .map((program) => program.trim().toLowerCase())
    .filter((program) => allowed.has(program));

  return programs.length ? [...new Set(programs)] : ["olympic", "paralympic"];
}

function selectCards(states, parsedArgs) {
  if (parsedArgs.all) return states;
  const wanted = new Set(parsedArgs.states);
  return states.filter((state) => wanted.has(state.stateCode));
}

function warnIfCredentialProjectDiffers() {
  const credentials = readGoogleApplicationCredentials();
  if (!credentials) return;

  try {
    if (credentials.project_id && credentials.project_id !== project) {
      const authNote = vertexAuthMode === "service_account"
        ? "VERTEX_AUTH_MODE=service_account is set, so this service account must have Vertex access on the Vertex project."
        : "Vertex image calls will use your local gcloud login by default; this service account is still used for Firebase Admin.";
      console.warn([
        "",
        "WARNING: GOOGLE_APPLICATION_CREDENTIALS belongs to a different Google Cloud project.",
        `  Credentials project: ${credentials.project_id}`,
        `  Vertex project:      ${project}`,
        `  Service account:     ${credentials.client_email || "(unknown)"}`,
        "",
        authNote,
        "To force Vertex to use this JSON key, set VERTEX_AUTH_MODE=service_account and grant the service account Vertex permission on the Vertex project.",
        credentials.client_email
          ? `  gcloud projects add-iam-policy-binding ${project} --member="serviceAccount:${credentials.client_email}" --role="roles/aiplatform.user"`
          : "",
        ""
      ].filter(Boolean).join("\n"));
    }
  } catch {
    // Credential parsing is only for a helpful warning; auth will report hard failures later.
  }
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

function programPanel(card, program) {
  return program === "paralympic" ? card.paralympicPanel : card.olympicPanel;
}

function displaySportName(value) {
  const text = String(value || "").trim();
  if (/^paratriathlon$/i.test(text)) return "Para triathlon";
  return text;
}

function sourceBackedSportFacts(featuredSport) {
  const sport = String(featuredSport || "").toLowerCase();
  if (/water polo/.test(sport)) {
    return {
      sourceLabels: ["LA28 Water Polo"],
      sourceUrls: ["https://la28.org/en/games-plan/olympics/water-polo.html"],
      facts: [
        "Water polo is played by two teams of seven in the water: six field players plus one goalkeeper.",
        "The goal is to throw the ball into the opponent's net; the team with more goals wins.",
        "LA28 describes water polo matches as four 8-minute quarters.",
        "LA28 describes 28-second possessions.",
        "LA28 notes players may only touch the ball with one hand, except the goalkeeper."
      ]
    };
  }
  if (/para\s*triathlon|paratriathlon/.test(sport)) {
    return {
      sourceLabels: ["Paralympic.org Para triathlon", "LA28 Para Triathlon"],
      sourceUrls: ["https://www.paralympic.org/triathlon/about", "https://la28.org/en/games-plan/paralympics/para-triathlon.html"],
      facts: [
        "Para triathlon includes a 750m swim, 20km bike segment, and 5km run.",
        "The competitor with the fastest total race time in their event wins.",
        "Transition time between stages is part of the race.",
        "Para triathlon includes transition control across swim, bike, and run segments.",
        "Depending on classification or event context, equipment may include a handcycle, tandem bicycle, bicycle, racing wheelchair, or guide support."
      ]
    };
  }
  return {
    sourceLabels: [],
    sourceUrls: [],
    facts: []
  };
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
  const imageSubject = imageSubjectForPanel(panel);
  const visualSubject = imageSubjectForPrompt({ imageSubject, program });
  const topSportContext = topSportContextForPanel(panel);
  const paletteStory = paletteStoryForCard(card);
  const palette = paletteStory[program] || paletteStory.olympic;
  const sportLogic = sportVisualLogicForPrompt({ card, panel, program, imageSubject });
  const programSpecificVisualRule = program === "paralympic"
    ? "Paralympic visual clarity: this panel must clearly read as a Paralympic/adaptive sport scene through respectful equipment, classification, guide, transition, or adaptive movement cues. Do not draw a generic Olympic-style athlete scene and merely label it Paralympic. Every visible land-sport figure or vehicle must look adaptive, not like a standard non-adaptive cyclist or runner."
    : "Olympic visual clarity: this panel should read as the featured Olympic sport cue without protected Olympic marks or official branding.";
  const programPhrase = program === "paralympic"
    ? "a Paralympic sport-family scene led by abstract equipment, playing surface, transition, or route cues"
    : "an Olympic sport-family scene led by abstract equipment, playing surface, ball, water, route, or terrain cues";

  return `Create one full-bleed 16:9 sports-card illustration artwork for Common Ground, a compliant Team USA x Google Cloud Hackathon prototype.

Artwork role: ${program === "paralympic" ? "Paralympic" : "Olympic"} image artwork for one half of the front of a state discovery card.
State: ${card.stateName}
Sport family: ${panel.sportFamily}
Primary visual sport cue: ${visualSubject}
Aggregate sport-tag context: ${topSportContext}
Shared trait: ${card.sharedTrait.name} — ${card.sharedTrait.description}
Geography context: ${card.geographySnapshot}

Visual direction:
- Match a premium rough collectible fan-atlas style, not the previous glossy low-poly card style.
- Style extraction target:
- ${ROUGH_FAN_ATLAS_STYLE}
- Attached style references are for visual style only. Extract the rough grain, muted green/blue/coral palette, rounded organic fields, fuzzy ink edges, simple sport-object collage, and soft editorial composition. Do not copy words, letters, "USA" text, exact layouts, card shapes, map shapes, logos, symbols, or any specific graphic element.
- Human figure style: if a figure appears, make it a flat anonymous paper-cut silhouette with a blank face/head, no eyes, no mouth, no hair detail, no skin-detail rendering, no realistic muscle/anatomy, no uniform detail, and no identifying marks.
- ${programSpecificVisualRule}
- Use ${programPhrase}, led by the primary visual sport cue when one is available.
- If a primary sport cue is available, show abstract equipment, setting, motion trails, terrain, field-of-play markings, object language, or generic faceless sport figures for that sport cue without portraying any real or identifiable person.
- Sport logic rules:
- ${sportLogic}
- If the sport cue is generalized because the source sport-tag count is limited or missing, use broad sport-family motion cues only.
- Use the state geography as the environment inspiration, not as a performance claim.
- Full-bleed artwork only: the illustration must fill the entire image canvas edge to edge.
- The rough paper texture must live inside the artwork; do not create a blank cream paper border around the image.
- Do not draw an inner card, picture frame, rounded rectangle, border, mat, white margin, inset panel, drop shadow, UI container, poster frame, or card-within-a-card.
- Do not reserve a visible boxed label area. Leave open negative space through composition only, not by drawing a panel or blank rectangle.
- Palette theme: ${paletteStory.name}.
- Program palette: ${palette}.
- Environmental color mood: ${paletteStory.atmosphere}.
- The Olympic and Paralympic panels are siblings on the same card; keep them visually related through the palette theme while giving this panel its own emphasis.
- Do not default to Olympic-as-blue and Paralympic-as-orange. Let the state palette drive the colors, and avoid a political campaign or national-flag color composition.
- Composition: 16:9 landscape artwork, readable at card size, with strong sport-object silhouette or environment cue and generous clean negative space in the upper-left for an overlaid app label, but no visible label box.
- Include the slight roughness/grain as a real visible texture, especially along color edges and in large flat fields. The artwork should not look too smooth or AI-glossy.
- Prefer a graphic collage like the attached reference graphics over a scenic panorama. Use larger simplified equipment and surface shapes, fewer tiny details, and no confusing physical action.

Compliance constraints:
- No athlete likeness, no recognizable face, no athlete names, no jersey numbers, no official uniforms, and no realistic real-person generated media. Any human figure must be fictional, blank-faced, faceless, geometric, generic, and non-identifiable, with no hair or skin-detail rendering.
- No Olympic rings, Paralympic Agitos, torches, medals, podiums, flags, Team USA logos, LA28 logos, NGB logos, sponsor logos, or brand marks.
- No embedded text, letters, labels, UI chrome, borders, or icons inside the image; the app will overlay labels separately.
- Do not imply geography creates, produces, guarantees, predicts, or proves athletic results.
- No finish times, scores, rankings, medal imagery, or comparison imagery.

Return only the image.`;
}

function imageSubjectForPanel(panel) {
  return displaySportName(panel.primarySportTag || panel.topSportTags?.[0] || panel.sportFamily || "general sport-family theme");
}

function imageSubjectForPrompt({ imageSubject, program }) {
  if (program === "paralympic" && /para\s*triathlon|paratriathlon/i.test(imageSubject)) {
    return "Para triathlon adaptive equipment sequence: swim cue, transition zone, handcycle, racing wheelchair or guide/prosthetic cue. Do not show standard upright bicycles, ordinary road cyclists, standalone runners, full-body standing land figures, or normal legs as the main land cue.";
  }
  if (/track and field|para track/i.test(imageSubject)) {
    return `${displaySportName(imageSubject)} competition surface: marked track lanes with any runner placed inside a lane, plus field-event geometry only inside the infield/throwing sector.`;
  }
  return imageSubject;
}

function topSportContextForPanel(panel) {
  const broaderTags = (panel.topSportTags || []).filter((tag) => tag !== panel.primarySportTag);
  if (panel.primarySportTag && broaderTags.length) {
    return `Lead only with ${displaySportName(panel.primarySportTag)} as the visual subject. Broader aggregate public sport tags for this state/program include ${joinList(broaderTags.map(displaySportName))}, but do not depict those secondary sports as objects, people, venues, or equipment in this image; they belong in the state briefing, not this featured-sport artwork. Do not display counts.`;
  }
  if (panel.primarySportTag) {
    return `Lead with ${displaySportName(panel.primarySportTag)}. This is the sourced featured sport tag for this state/program and should guide the illustration without displaying counts.`;
  }
  if (panel.topSportTags?.length) {
    return `${joinList(panel.topSportTags.map(displaySportName))}. These are aggregate public sport tags for this state/program and should guide the illustration without displaying counts.`;
  }
  return "No top sport tag is exposed for this panel because the public roster signal is low-volume or unavailable; keep the artwork generalized.";
}

function sportVisualLogicForPrompt({ card, panel, program, imageSubject }) {
  const sport = String(imageSubject || "").toLowerCase();
  const stateContext = `Use ${card.stateName}'s geography as abstract setting texture only; do not imply the terrain causes sport results.`;

  if (/water polo/.test(sport)) {
    return [
      "Water polo logic: show a pool/water setting, a floating water-polo ball, a goal/cage, ripples, pool markings, and passing arcs.",
      "If generic figures appear, they must be simplified paper-cut silhouettes, partially submerged and treading water, with only shoulders/blank heads above water and no visible feet planted on the surface.",
      "Avoid hair shapes and realistic skin tones; use flat silhouette colors or swim-cap-like simplified heads.",
      "Do not show anyone standing, walking, skating, running, biking, or playing on top of water.",
      "Do not include skateboard ramps, track lanes, road cycling, open-ocean racing, or unrelated secondary sports in this panel.",
      "The sport story should read as pool spacing and passing pressure, not beach recreation or a land sport.",
      stateContext
    ].join("\n- ");
  }

  if (/para\s*triathlon|paratriathlon/.test(sport)) {
    return [
      "Para triathlon logic: this must be an adaptive-equipment-first scene, not a generic triathlon scene.",
      "Show three respectful cues only: a swim cue in water, a transition zone, and adaptive land equipment such as a handcycle plus racing wheelchair, guide tether, or simplified prosthetic/blade cue.",
      "The clearest composition is: water/swim cue on the left, transition gear in the middle, handcycle and racing wheelchair/guide/prosthetic cue moving together on one land route to the right.",
      "Hard ban: no standard upright bicycles, no standard road bikes, no ordinary road cyclists, no standalone runners, no jogging silhouettes, no full-body standing land figures, no generic non-adaptive triathlon figures, and no normal legs as the primary land cue.",
      "Do not draw a solo upright bike even in the background. Do not draw an ordinary runner or ordinary standing person even in the background. Use adaptive equipment or omit the land figure.",
      "If a cycling cue appears, it must read clearly as a handcycle, recumbent adaptive cycle, or tandem/guide-support setup. Prefer handcycle over tandem.",
      "If a run cue appears, it must read clearly as a racing wheelchair, guide tether/guide support, or simplified prosthetic/blade cue. Do not depict a lone standard runner.",
      "All handcycles, racing wheelchairs, route arrows, and road curves must move in the same direction. Do not depict opposing riders, head-on traffic, intersecting paths, or near-collision composition.",
      "Do not show riders, handcycles, wheelchairs, bikes, or route lines entering the ocean. Do not show the swim happening after the land segments.",
      "If generic figures appear on land, they must be using or guiding adaptive equipment: handcycle, racing wheelchair, guide tether, or simplified prosthetic/blade cue. Do not show generic standing spectators, generic runners, or generic cyclists.",
      "If generic figures appear, keep them blank-faced and geometric, with the adaptive equipment doing the storytelling. No race numbers, uniforms, logos, official marks, or athlete likeness.",
      "Make the panel instantly read as Para triathlon through adaptive equipment, transition control, and water-to-road sequencing.",
      stateContext
    ].join("\n- ");
  }

  if (/swimming|para swimming/.test(sport)) {
    return [
      "Swimming logic: show pool lanes, water surface, lane ropes, goggles, swim cap shapes, ripples, and lane rhythm.",
      "If generic figures appear, they must be in water, not standing on top of it or on land.",
      "Do not show open-road, bike, court, or unrelated secondary sport equipment.",
      stateContext
    ].join("\n- ");
  }

  if (/surfing/.test(sport)) {
    return [
      "Surfing logic: show surfboard, wave face, ocean swell, shoreline rhythm, and balance cues.",
      "If generic figures appear, they must be faceless and positioned on/near a board in a stylized wave context.",
      "Do not show pool lanes, bicycle paths, courts, or unrelated secondary sport equipment.",
      stateContext
    ].join("\n- ");
  }

  if (/cycling|para-cycling|para cycling/.test(sport)) {
    return [
      "Cycling logic: show wheels, road curves, route lines, bike/handcycle equipment, surface rhythm, and terrain contours.",
      "If generic figures appear, they must be faceless and placed on land roads only, never in water.",
      "Do not show swimming order, pool play, or unrelated secondary sports.",
      stateContext
    ].join("\n- ");
  }

  if (/track and field|para track/.test(sport)) {
    return [
      "Track and field logic: the competition surface must make physical sense. Build the scene around one clear oval or curved track with visible lanes.",
      "If a runner appears, the runner's feet must be inside one marked lane and visibly touching the track surface. The lane lines should pass under/around the runner, not behind them as scenery.",
      "Do not place a runner on grass, water, mountain shapes, abstract circular rings, floating paths, or outside the marked track lanes.",
      "If field-event equipment appears, place it in the infield or a clear throwing/jumping sector inside or next to the track. Do not make javelins, discus, shot, or jumping marks float randomly over the landscape.",
      "Use mountains, snow, trees, or state geography only as background beyond the stadium/track surface, not as the surface the athlete runs on.",
      "Avoid disconnected motion rings that look like a second track under the runner. One readable track surface is better than a decorative collage.",
      "If generic figures appear, they must be faceless and stylized; no bibs, lane numbers, uniforms, or recognizable athletes.",
      "Do not show finish times, rankings, scoreboards, medals, or unrelated secondary sport equipment.",
      stateContext
    ].join("\n- ");
  }

  if (/shooting|archery/.test(sport)) {
    return [
      "Precision sport logic: show target rings as abstract non-medal geometry, focus lines, bow/equipment silhouettes, calm spacing, and stillness cues.",
      "Avoid realistic weapons detail; keep equipment simplified and editorial.",
      "Do not show scores, rankings, bullseye results, official marks, or athlete likeness.",
      stateContext
    ].join("\n- ");
  }

  if (/volleyball|soccer|basketball|rugby|water polo/.test(sport)) {
    return [
      "Team-sport logic: show the featured ball, court/field/pool markings, passing lanes, spacing arcs, and team movement cues.",
      "If generic figures appear, make them faceless geometric paper-cut figures with no uniform detail or numbers.",
      "Do not show unrelated secondary sports from the state mix.",
      stateContext
    ].join("\n- ");
  }

  if (/skateboarding/.test(sport)) {
    return [
      "Skateboarding logic: show board, rails, ramps, plaza shapes, balance arcs, and urban surface cues.",
      "If generic figures appear, make them faceless and geometric with no identifiable clothing or logos.",
      "Do not show aquatic, cycling, or unrelated secondary sport equipment.",
      stateContext
    ].join("\n- ");
  }

  return [
    `${program === "paralympic" ? "Paralympic" : "Olympic"} featured-sport logic: visualize only the featured sport cue and its sport-family theme.`,
    "Do not mix in secondary sports, unrelated equipment, or confusing physical actions.",
    "If generic figures appear, keep them fictional, faceless, geometric, and non-identifiable.",
    stateContext
  ].join("\n- ");
}

function currentPanelMetadata({ card, program, prompt, copyPrompt, cardBackCopy }) {
  const panel = programPanel(card, program);
  return {
    promptVersion: PROMPT_VERSION,
    promptSummary: `${card.stateName} ${program} ${imageSubjectForPanel(panel)}`,
    primarySportTag: panel.primarySportTag || null,
    topSportTags: panel.topSportTags || [],
    cardBackCopy,
    cardBackCopySource: "gemini",
    cardBackCopyVersion: CARD_BACK_COPY_VERSION,
    cardBackCopyModel: cardCopyModel,
    cardBackCopyPromptHash: hashText(copyPrompt),
    paletteTheme: paletteStoryForCard(card).name,
    promptHash: hashText(prompt)
  };
}

async function getOrGenerateCardBackCopy({ token, card, program, existingPanel, copyPrompt }) {
  const copyPromptHash = hashText(copyPrompt);
  if (
    !args.force &&
    existingPanel?.cardBackCopySource === "gemini" &&
    existingPanel?.cardBackCopyVersion === CARD_BACK_COPY_VERSION &&
    existingPanel?.cardBackCopyModel === cardCopyModel &&
    existingPanel?.cardBackCopyPromptHash === copyPromptHash &&
    existingPanel?.cardBackCopy
  ) {
    return existingPanel.cardBackCopy;
  }

  console.log(`Generating ${card.stateName} ${program} card-back copy with ${cardCopyModel}...`);
  let validationPrompt = copyPrompt;
  let lastError;

  for (let attempt = 1; attempt <= imageMaxAttempts; attempt += 1) {
    const rawCopy = await generateGeminiJsonWithRetry({
      token,
      prompt: validationPrompt,
      modelName: cardCopyModel,
      label: `${card.stateName} ${program} card-back copy`,
      timeoutMs: textRequestTimeoutMs
    });

    try {
      return validateCardBackCopy({ card, program, rawCopy });
    } catch (error) {
      lastError = error;
      if (attempt >= imageMaxAttempts) throw error;
      console.warn(`${card.stateName} ${program} card-back copy failed validation on attempt ${attempt}/${imageMaxAttempts}: ${error.message}`);
      validationPrompt = `${copyPrompt}

Previous JSON failed local validation:
${error.message}

Rewrite the JSON from scratch, keeping the same fields and avoiding every unsafe phrase listed above.`;
    }
  }

  throw lastError;
}

function buildCardBackCopyPrompt(card, program) {
  const panel = programPanel(card, program);
  const programName = program === "paralympic" ? "Paralympic" : "Olympic";
  const storyFeatured = program === "paralympic" ? card.cardStory?.paralympicFeatured : card.cardStory?.olympicFeatured;
  const otherTopSportTags = (panel.topSportTags || []).filter((tag) => tag !== panel.primarySportTag);
  const featuredSport = displaySportName(storyFeatured?.sportTag || panel.primarySportTag || panel.topSportTags?.[0] || "");
  const payload = {
    stateName: card.stateName,
    program: programName,
    geographySnapshot: card.geographySnapshot,
    climateSignal: card.climateSignal,
    terrainSignals: card.terrainSignals,
    sharedTrait: card.sharedTrait,
    cardStory: {
      themeName: card.cardStory?.themeName,
      geographySignal: card.cardStory?.geographySignal,
      sharedTrait: card.cardStory?.sharedTrait,
      fanChallengeName: card.cardStory?.fanChallengeName,
      featuredSportForThisProgram: stripRecordCounts(storyFeatured) || null
    },
    panel: {
      label: panel.label,
      sportFamily: panel.sportFamily,
      aggregateSignal: panel.aggregateSignal,
      featuredSportDisplayName: featuredSport || null,
      primarySportTag: displaySportName(panel.primarySportTag) || null,
      otherTopSportTagsForStateBriefingOnly: otherTopSportTags.map(displaySportName),
      geographyConnection: panel.geographyConnection,
      sourceLabels: (panel.sourceRefs || []).map((source) => source.label)
    },
    sourceBackedSportFacts: sourceBackedSportFacts(featuredSport)
  };

  return `You are Gemini writing the back of one collectible Common Ground state card panel.

Use only the provided aggregate public Team USA and geography data.
Do not mention individual athlete names, athlete profiles, photos, biographies, specific team names, rankings, medals, actual finish times, actual scores, or scoring results.
Do not mention exact athlete-record counts.
Sport education is allowed: you may explain how scoring works, how winning works, rule clocks, field-of-play numbers, event distances, and whether the fastest total race time wins.
Do not say geography causes, creates, produces, predicts, or guarantees athletic results.
Use conditional fan-discovery language such as "may suggest", "could help fans understand", "appears associated with", or "could show how".
Keep the copy useful for a sports fan, not a data engineer.
Do not use internal words like "row", "pipeline", "raw data", "card image cue", "featured cue", "card lens", "sport tag", "sport tags", "template", "fallback", "signal", "participation signal", "aggregate presence", or "athletic landscape".
Do not write "state signal", "high signal", "medium signal", "low signal", or "high aggregate presence" in final copy. Use the bucket only to decide whether the copy should be specific or generalized.
Avoid backend-sounding or vague phrases like "roster data", "roster", "representation", "prominent feature", "athletic connections", "frequently associated", "ties to", "backdrop", "frame", or "could help fans discover".
Do not overstate the cue with words like "strong", "dominant", "best", or "proves".
Avoid awkward generated openings such as "[Sport] invites fans", "[Sport] invites a look", "[Sport] is featured here", or "[Sport] is featured because".
Avoid physical-demand wording such as "demands", "requires", "essential", "rigorous", "stamina", "maintain speed", or "intense physical pressure". Prefer concrete fan-observation wording such as "look for", "notice", "watch how", "shows", and "could help fans understand".
Avoid generic enthusiasm words such as "fascinating", "interesting part", "compelling", or "dynamic" when concrete sport detail would be clearer.
Gemini should write the final copy. The provided sourceBackedSportFacts are guardrails and context, not a prewritten answer. Use the facts only when they make the panel more useful for a fan.
This panel is only about the featured sport. Do not mention other sports from otherTopSportTagsForStateBriefingOnly; those belong in the Gemini State Briefing.
Make every field answer: "why would a fan care?"
Avoid repeating the same abstract trait language across fields. Each field must add a different kind of value.
Do not use section-title language like "Why this sport", "Movement read", "State context", "Fan Takeaway", or "Watch Lens" inside the values.
Keep the same storytelling quality as the examples, but do not reuse the same sentence formulas on every card. Vary the opening line, answer rhythm, and sport-specific details by state/program.
Do not use a fixed skeleton like "Sport looks chaotic, but actually..." + "For a [state] card..." + "Watch how...".
Do not force every sport panel to mention the state in the same sentence pattern. Sometimes the state connection can sit in the middle. Sometimes the watch hook can lead. Sometimes a hidden skill can lead.
Start by teaching the user what they are watching. Then explain why it is fun, how the state context may connect, and how the card trait works.
Use concrete sport facts only when they are present in sourceBackedSportFacts or safely general from the provided sport-family data.

HOW IT WORKS must assume the user has never watched the sport before. It must explain:
1. the basic objective,
2. how scoring or winning works,
3. the core format,
4. one beginner-friendly rule or mechanic.

WHY IT'S FUN TO WATCH must sound like a fan viewing guide, not a trait analysis. It should tell the user what makes the sport exciting to watch.

Allowed content modules:
- Watch Hook: what a fan should notice while watching
- State Culture: how the sport could connect to the state's public sport culture or environment
- Terrain/Environment Lens: coast, mountains, desert, urban courts, pools, roads, snow, water, or other setting context
- Rules Snapshot: one simple thing new fans should know
- Hidden Skill: the subtle skill fans usually miss
- Broadcast Moment: the moment where tension spikes
- Gear/Setup: equipment, transition, playing surface, or adaptation context
- Pace Shift: how rhythm changes during the event
- Fan Myth-Buster: a misconception corrected in one sentence
- Sport Family Link: why this belongs in the card's sport-family theme
- Challenge Link: how this connects to the mini-game

Return valid JSON only with these fields:
- featuredCue: short display label. If featuredSportDisplayName or primarySportTag is present, use that display name exactly. If not, use a concise generalized cue.
- moduleMix: array of 2-3 chosen module names from the allowed content modules. Choose modules that fit this sport/state. Do not choose the same moduleMix pattern for every panel.
- subtitle: concise display line with 3-4 short phrases separated by " · ". It should feel like the subline on a collectible card.
- qaFacts: object with exactly these string fields. Each answer should be 1-2 short sentences, useful, and concrete:
  - howItWorks: answer "How it works" with plain rules, format, or what the sport is.
  - watchValue: answer "Why it's fun to watch" with a concrete fan-facing hook.
  - stateConnection: answer "State connection" with conditional geography/weather/context language.
  - cardTrait: answer "Card trait" by tying this featured sport to the sharedTrait and mini-game idea.
- factChips: array of 3-4 tiny "Quick facts" chip labels. Each chip must be 2-8 words. Use source-backed sport facts, viewing cues, equipment/terrain/context cues, or event-type context. Do not include exact counts from the roster dataset.
- complianceWarnings: array of strings, empty if safe.

Style references only. Do not copy them verbatim and do not force every state into waterline language:
Example Olympic panel style:
{
  "featuredCue": "Water Polo",
  "moduleMix": ["Rules Snapshot", "Hidden Skill", "Watch Hook"],
  "subtitle": "Aquatic team sport · goals in net · possession pressure",
  "qaFacts": {
    "howItWorks": "Two teams of seven play in the water: six field players plus one goalkeeper. The goal is to throw the ball into the opponent's net, and each short possession pushes teams to create space, pass, and shoot before the chance disappears.",
    "watchValue": "Water polo gets easier to read when you watch the spacing before the shot. The drama is that every pass, fake, and goal attempt happens while players are swimming or treading water.",
    "stateConnection": "California's Pacific coast, outdoor aquatic access, and large urban sport communities could help fans understand why water-based team stories fit this state card.",
    "cardTrait": "Water polo connects to Waterline Control through spacing, body position, and quick rhythm changes in a pool where no one has stable footing."
  },
  "factChips": ["7 per team: 6 field + goalkeeper", "4 quarters", "28-second possessions", "One-hand control"],
  "complianceWarnings": []
}

Example Paralympic panel style:
{
  "featuredCue": "Para triathlon",
  "moduleMix": ["Rules Snapshot", "Gear/Setup", "Pace Shift"],
  "subtitle": "Swim · bike · run · transition control",
  "qaFacts": {
    "howItWorks": "Para triathlon is a race across three stages: a 750m swim, a 20km bike segment, and a 5km run. The competitor with the fastest total race time in their event wins, and transition time between stages matters too.",
    "watchValue": "The race keeps changing shape: water gives way to equipment setup, then bike rhythm, then another reset for the run. The fun is watching how quickly the event can shift at each transition.",
    "stateConnection": "California's coastline, road networks, varied terrain, and year-round outdoor access could help fans understand why water-connected endurance stories fit this state card.",
    "cardTrait": "Para triathlon connects to Waterline Control through pacing and adaptation across changing surfaces."
  },
  "factChips": ["750m swim", "20km bike", "5km run", "Transition control"],
  "complianceWarnings": []
}

Panel data:
${JSON.stringify(payload, null, 2)}`;
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

async function generateGeminiJsonWithRetry({ token, prompt, modelName, label, timeoutMs }) {
  let lastError;

  for (let attempt = 1; attempt <= imageMaxAttempts; attempt += 1) {
    try {
      return await generateGeminiJson({ token, prompt, modelName, timeoutMs });
    } catch (error) {
      lastError = error;
      const retryable = isRetryableVertexImageError(error);
      if (!retryable || attempt >= imageMaxAttempts) throw error;
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
        temperature: 0.55
      }
    },
    timeoutMs
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    const error = new Error(`Vertex Gemini JSON request failed: ${response.statusCode} ${response.bodyText}`);
    error.status = response.statusCode;
    error.retryable = [408, 409, 425, 429, 499, 500, 502, 503, 504].includes(response.statusCode);
    throw error;
  }

  const payload = JSON.parse(response.bodyText);
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
  if (!text.trim()) throw new Error("Gemini JSON response did not include text.");
  return JSON.parse(normalizeJsonText(text));
}

function validateCardBackCopy({ card, program, rawCopy }) {
  const panel = programPanel(card, program);
  const requiredFields = ["featuredCue", "subtitle", "qaFacts"];
  const missingFields = requiredFields.filter((field) => !String(rawCopy?.[field] || "").trim());
  if (missingFields.length) {
    throw new Error(`Gemini card-back copy is missing required fields: ${missingFields.join(", ")}`);
  }
  const requiredQaFields = ["howItWorks", "watchValue", "stateConnection", "cardTrait"];
  const missingQaFields = requiredQaFields.filter((field) => !String(rawCopy.qaFacts?.[field] || "").trim());
  if (missingQaFields.length) {
    throw new Error(`Gemini card-back copy is missing qaFacts fields: ${missingQaFields.join(", ")}`);
  }
  if (!Array.isArray(rawCopy.factChips) || rawCopy.factChips.length < 3) {
    throw new Error("Gemini card-back copy must include at least 3 factChips.");
  }
  if (!Array.isArray(rawCopy.moduleMix) || rawCopy.moduleMix.length < 2 || rawCopy.moduleMix.length > 3) {
    throw new Error("Gemini card-back copy must include 2-3 moduleMix entries.");
  }

  const moduleMix = rawCopy.moduleMix
    .map((moduleName) => String(moduleName || "").trim())
    .filter((moduleName) => ALLOWED_CARD_BACK_MODULES.has(moduleName))
    .slice(0, 3);
  if (moduleMix.length < 2) {
    throw new Error("Gemini card-back copy did not choose enough allowed moduleMix entries.");
  }

  const expectedCue = displaySportName(panel.primarySportTag) || null;
  const qaFacts = Object.fromEntries(requiredQaFields.map((field) => [field, String(rawCopy.qaFacts[field]).trim()]));
  const rawFactChips = rawCopy.factChips.map((chip) => String(chip || "").trim()).filter(Boolean).slice(0, 4);
  const factChips = normalizeFactChipsForSport(expectedCue || rawCopy.featuredCue, rawFactChips);
  const copy = {
    featuredCue: expectedCue || String(rawCopy.featuredCue).trim(),
    moduleMix,
    subtitle: String(rawCopy.subtitle).trim(),
    qaFacts,
    factChips,
    relatedTags: (panel.topSportTags || []).map(displaySportName).filter((tag) => tag !== expectedCue),
    complianceWarnings: Array.isArray(rawCopy.complianceWarnings)
      ? rawCopy.complianceWarnings.map((warning) => String(warning || "").trim()).filter(Boolean)
      : []
  };
  const warnings = complianceCheckCardBackCopy(copy);
  if (warnings.length) {
    throw new Error(`Gemini card-back copy failed validation: ${warnings.join("; ")}`);
  }
  return copy;
}

function normalizeFactChipsForSport(featuredCue, factChips) {
  if (!/water polo/i.test(String(featuredCue || ""))) return factChips;
  const clearerTeamChip = "7 per team: 6 field + goalkeeper";
  const nextChips = factChips.map((chip) => (/^7\b/i.test(chip) ? clearerTeamChip : chip));
  if (!nextChips.includes(clearerTeamChip)) {
    return [clearerTeamChip, ...nextChips].slice(0, 4);
  }
  return nextChips;
}

function complianceCheckCardBackCopy(copy) {
  const text = [
    copy.featuredCue,
    copy.subtitle,
    ...Object.values(copy.qaFacts || {}),
    ...(copy.factChips || []),
  ].filter(Boolean).join(" ");
  const bannedPatterns = [
    /\bguarantee(s|d)?\b/i,
    /\bproduce(s|d)?\b/i,
    /\bcreates?\b/i,
    /\bpredict(s|ed|ive)?\b/i,
    /\btrain like\b/i,
    /\belite\b/i,
    /\bmedal(s|ist|ists)?\b/i,
    /\bfinish times?\b/i,
    /\bscore(s|d|ing)? result\b/i,
    /\bsignals?\b/i,
    /\bsport tags?\b/i,
    /\bfeatured cue\b/i,
    /\bcard lens\b/i,
    /\bwhy this sport\b/i,
    /\bmovement read\b/i,
    /\baggregate presence\b/i,
    /\broster data\b/i,
    /\broster\b/i,
    /\brepresentation\b/i,
    /\bprominent feature\b/i,
    /\bbackdrop\b/i,
    /\bframes?\b/i,
    /\bframing\b/i,
    /\bcould help fans discover\b/i,
    /\binvites?\s+(fans|a|the|you)\b/i,
    /\bis featured because\b/i,
    /\bis featured here\b/i,
    /\bfrequently associated\b/i,
    /\bties to\b/i,
    /\brows?\b/i,
    /\bpipeline\b/i,
    /\btemplate\b/i,
    /\bfallback\b/i,
    /\braw data\b/i,
    /\bcard image cue\b/i,
    /\bparticipation signal\b/i,
    /\bathletic landscape\b/i,
    /\bstrong(?:er|est)?\b/i,
    /\bdominant\b/i,
    /\bbest\b/i,
    /\bproves?\b/i,
    /\bdemands?\b/i,
    /\brequires?\b/i,
    /\bessential\b/i,
    /\brigorous\b/i,
    /\bstamina\b/i,
    /\bmaintain speed\b/i,
    /\bintense physical pressure\b/i,
    /\bfascinating\b/i,
    /\binteresting part\b/i,
    /\bcompelling\b/i,
    /\bdynamic\b/i,
    /\blooks chaotic,? but\b/i,
    /\bunderlying game\b/i,
    /\bFor (a|an) [A-Z][A-Za-z .'-]+ card\b/,
    /\bmost popular county\b/i,
    /\brace order\b/i,
    /\b\d+(\.\d+)?\s?(points?|percent|%)\b/i
  ];
  const warnings = bannedPatterns.filter((pattern) => pattern.test(text)).map((pattern) => `Unsafe phrase pattern: ${pattern}`);
  for (const tag of copy.relatedTags || []) {
    if (tag && new RegExp(`\\b${escapeRegExp(tag)}\\b`, "i").test(text)) {
      warnings.push(`Featured panel mentioned non-featured sport tag: ${tag}`);
    }
  }
  return warnings.concat((copy.complianceWarnings || []).filter(Boolean));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeJsonText(text) {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function joinList(items) {
  const values = items.filter(Boolean);
  if (values.length <= 1) return values[0] || "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

async function generateGeminiImageWithRetry({ token, prompt, label }) {
  let lastError;

  for (let attempt = 1; attempt <= imageMaxAttempts; attempt += 1) {
    try {
      return await generateGeminiImage({ token, prompt });
    } catch (error) {
      lastError = error;
      const retryable = isRetryableVertexImageError(error);
      if (!retryable || attempt >= imageMaxAttempts) {
        throw error;
      }

      const delayMs = imageRetryDelayMs * attempt;
      console.warn(`${label} image request failed on attempt ${attempt}/${imageMaxAttempts}: ${error.message}`);
      console.warn(`Retrying in ${Math.round(delayMs / 1000)}s...`);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

async function generateGeminiImage({ token, prompt }) {
  const endpoint = vertexEndpoint();
  const styleReferenceParts = loadStyleReferenceParts();
  const requestBody = {
    contents: {
      role: "USER",
      parts: [
        { text: prompt },
        ...styleReferenceParts
      ]
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
  };
  const response = await postVertexJson(endpoint, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: requestBody,
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

function loadStyleReferenceParts() {
  if (String(process.env.CARD_STYLE_REFERENCES || "1").trim() === "0") return [];

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

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Vertex Gemini image request timed out after ${Math.round(timeoutMs / 1000)}s while waiting for a response.`));
    });
    request.on("error", reject);
    request.write(bodyText);
    request.end();
  });
}

function isRetryableVertexImageError(error) {
  if (error?.retryable) return true;

  const message = String(error?.message || "");
  const causeCode = String(error?.cause?.code || "");
  return [
    "fetch failed",
    "Headers Timeout",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_BODY_TIMEOUT",
    "ETIMEDOUT",
    "ECONNRESET",
    "ECONNREFUSED",
    "EAI_AGAIN"
  ].some((token) => message.includes(token) || causeCode.includes(token));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function vertexEndpoint() {
  return vertexEndpointForModel(model);
}

function vertexEndpointForModel(modelName) {
  const host = location === "global"
    ? "https://aiplatform.googleapis.com"
    : `https://${location}-aiplatform.googleapis.com`;
  return `${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(modelName)}:generateContent`;
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

async function getFirebaseClients() {
  if (firebaseClientsPromise) return firebaseClientsPromise;

  firebaseClientsPromise = (async () => {
    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
    if (!storageBucket) {
      throw new Error("FIREBASE_STORAGE_BUCKET is required when using --firebase. Add it to .env.");
    }

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

async function savePanelToFirebase({ card, program, imageBuffer, mimeType, prompt, panelRecord }) {
  const { bucket, db, firebaseProjectId, FieldValue, storageBucket } = await getFirebaseClients();
  const objectName = `${card.stateCode.toLowerCase()}-${program}.png`;
  const storagePath = `card-panels/${PROMPT_VERSION}/${card.stateCode.toLowerCase()}/${objectName}`;
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
        commonGroundProgram: program,
        commonGroundPromptVersion: PROMPT_VERSION,
        commonGroundPromptHash: hashText(prompt)
      }
    }
  });

  const downloadUrl = firebaseDownloadUrl(storageBucket, storagePath, downloadToken);
  const firebaseRecord = {
    ...panelRecord,
    url: downloadUrl,
    downloadUrl,
    storageBucket,
    firebaseProjectId,
    storagePath,
    gsUri: `gs://${storageBucket}/${storagePath}`,
    firebaseCollection: "cardPanels",
    localUrl: panelRecord.localUrl
  };

  const stateDoc = db.collection("cardPanels").doc(card.stateCode);
  await stateDoc.set({
    stateCode: card.stateCode,
    stateName: card.stateName,
    sharedTrait: card.sharedTrait,
    hometownPresenceBucket: card.hometownPresenceBucket,
    hometownRosterCounts: card.hometownRosterCounts,
    model,
    cardCopyModel,
    location,
    promptVersion: PROMPT_VERSION,
    paletteTheme: panelRecord.paletteTheme,
    updatedAt: FieldValue.serverTimestamp(),
    panels: {
      [program]: firebaseRecord
    }
  }, { merge: true });

  await stateDoc.collection("panels").doc(program).set({
    ...firebaseRecord,
    stateCode: card.stateCode,
    stateName: card.stateName,
    program,
    prompt,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  console.log(`Uploaded ${card.stateCode} ${program} to gs://${storageBucket}/${storagePath}`);
  console.log(`Wrote Firestore cardPanels/${card.stateCode} and cardPanels/${card.stateCode}/panels/${program}`);

  return firebaseRecord;
}

async function writePanelMetadataToFirebase({ card, program, prompt, panelRecord }) {
  const { db, FieldValue } = await getFirebaseClients();
  const stateDoc = db.collection("cardPanels").doc(card.stateCode);

  await stateDoc.set({
    stateCode: card.stateCode,
    stateName: card.stateName,
    sharedTrait: card.sharedTrait,
    hometownPresenceBucket: card.hometownPresenceBucket,
    hometownRosterCounts: card.hometownRosterCounts,
    model,
    cardCopyModel,
    location,
    promptVersion: PROMPT_VERSION,
    paletteTheme: panelRecord.paletteTheme,
    updatedAt: FieldValue.serverTimestamp(),
    panels: {
      [program]: panelRecord
    }
  }, { merge: true });

  await stateDoc.collection("panels").doc(program).set({
    ...panelRecord,
    stateCode: card.stateCode,
    stateName: card.stateName,
    program,
    prompt,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  console.log(`Synced Firestore metadata for cardPanels/${card.stateCode}/panels/${program}`);
}

function firebaseDownloadUrl(bucketName, storagePath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;
}

function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function getAccessToken() {
  if (process.env.VERTEX_ACCESS_TOKEN) return process.env.VERTEX_ACCESS_TOKEN;
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) return process.env.GOOGLE_OAUTH_ACCESS_TOKEN;

  const credentials = readGoogleApplicationCredentials();
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const credentialsProjectMatchesVertex = credentials?.project_id && credentials.project_id === project;

  if (vertexAuthMode === "service_account") {
    if (!credentialsPath) {
      throw new Error("VERTEX_AUTH_MODE=service_account requires GOOGLE_APPLICATION_CREDENTIALS to point to a service-account JSON file.");
    }
    return accessTokenFromServiceAccount(credentialsPath);
  }

  if (vertexAuthMode === "gcloud") {
    return accessTokenFromGcloud();
  }

  if (credentialsPath && credentialsProjectMatchesVertex) {
    return accessTokenFromServiceAccount(credentialsPath);
  }

  if (credentialsPath && credentials?.project_id && credentials.project_id !== project) {
    console.log("Using gcloud auth for Vertex because GOOGLE_APPLICATION_CREDENTIALS is reserved for Firebase in a different project.");
  }

  try {
    return await accessTokenFromGcloud();
  } catch (gcloudError) {
    if (credentialsPath) {
      console.warn("gcloud auth was not available for Vertex; falling back to GOOGLE_APPLICATION_CREDENTIALS.");
      return accessTokenFromServiceAccount(credentialsPath);
    }
    throw gcloudError;
  }
}

async function accessTokenFromGcloud() {
  try {
    const { stdout } = await execFileAsync("gcloud", ["auth", "print-access-token"], { timeout: 15000 });
    const token = stdout.trim();
    if (token) return token;
  } catch (error) {
    throw new Error([
      "gcloud auth was not available for Vertex.",
      "Run `gcloud auth login`, or set VERTEX_ACCESS_TOKEN, or set VERTEX_AUTH_MODE=service_account with GOOGLE_APPLICATION_CREDENTIALS.",
      `Original error: ${error.message}`
    ].join(" "));
  }

  throw new Error([
    "No Vertex authentication was found.",
    "Run `gcloud auth login`, set VERTEX_ACCESS_TOKEN, or set VERTEX_AUTH_MODE=service_account with GOOGLE_APPLICATION_CREDENTIALS."
  ].join(" "));
}

function normalizeVertexAuthMode(rawMode) {
  const mode = String(rawMode || "auto").trim().toLowerCase();
  if (["auto", "gcloud", "service_account"].includes(mode)) return mode;

  throw new Error(`Invalid VERTEX_AUTH_MODE="${rawMode}". Use "auto", "gcloud", or "service_account".`);
}

function positiveInteger(rawValue, fallback) {
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
