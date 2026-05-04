import http from "node:http";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

loadDotEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");
const DIST_DIR = path.join(__dirname, "dist");
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-pro-preview";
const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "";
const GOOGLE_CLOUD_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || "global";
const VERTEX_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

let cachedDataset;
let cachedStaticRoot;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function staticRoot() {
  if (!cachedStaticRoot) {
    cachedStaticRoot = (await pathExists(path.join(DIST_DIR, "index.html"))) ? DIST_DIR : PUBLIC_DIR;
  }
  return cachedStaticRoot;
}

async function loadDataset() {
  if (!cachedDataset) {
    const preferred = path.join(PUBLIC_DIR, "data", "state-cards.json");
    const fallback = path.join(DIST_DIR, "data", "state-cards.json");
    const raw = await readFile((await pathExists(preferred)) ? preferred : fallback, "utf8");
    cachedDataset = JSON.parse(raw);
  }
  return cachedDataset;
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function normalizeJsonText(text) {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function joinReadableList(items = []) {
  const values = items.filter(Boolean);
  if (values.length <= 1) return values[0] || "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function displaySportName(value) {
  const text = String(value || "").trim();
  if (/^paratriathlon$/i.test(text)) return "Para triathlon";
  return text;
}

function safeFallbackBriefing(card, reason = "No live Gemini response was available.") {
  const olympicMix = joinReadableList((card.olympicPanel.topSportTags || []).map(displaySportName));
  const paralympicMix = joinReadableList((card.paralympicPanel.topSportTags || []).map(displaySportName));
  const olympicCue = displaySportName(card.olympicPanel.primarySportTag || card.olympicPanel.topSportTags?.[0] || card.olympicPanel.sportFamily);
  const paralympicCue = displaySportName(card.paralympicPanel.primarySportTag || card.paralympicPanel.topSportTags?.[0] || card.paralympicPanel.sportFamily);
  const geography = card.cardStory?.geographySignal?.length
    ? joinReadableList(card.cardStory.geographySignal)
    : card.geographySnapshot;
  return {
    stateScene: `${card.stateName} reads as a layered state sport story: ${geography}. Public Team USA and geography data may suggest several fan-discovery paths without implying geography determines outcomes.`,
    sportMix: {
      olympic: olympicMix ? `Olympic side: ${olympicMix}.` : `Olympic side: ${card.olympicPanel.sportFamily}.`,
      paralympic: paralympicMix ? `Paralympic side: ${paralympicMix}.` : `Paralympic side: ${card.paralympicPanel.sportFamily}.`
    },
    whyInteresting: `The state-wide hook is contrast: fans can compare different settings, surfaces, and movement rhythms inside one shared state card.`,
    geographyLens: `${card.geographySnapshot} could help fans understand why varied sport environments appear in this aggregate state view.`,
    fanHook: `Start with the featured pairing, then scan the broader mix for sports that look unrelated but share rhythm, spacing, pacing, precision, or equipment-control ideas.`,
    surprisingConnection: `${olympicCue} and ${paralympicCue} look different, but both can point fans toward ${card.sharedTrait.name.toLowerCase()} as a shared viewing idea.`,
    sharedSignal: `${card.sharedTrait.name}: ${card.sharedTrait.description}`,
    exploreNext: `Try the State Sync Challenge as a fan-game interaction only; it is not a performance measurement or comparison.`,
    dataSafetyNote: "Aggregate state view only. No individual names, likenesses, finish times, scoring results, rankings, medals, or performance predictions.",
    gameIntro: `Try a short fan challenge that reflects ${card.sharedTrait.name.toLowerCase()} as a personal game interaction only.`,
    complianceWarnings: [reason, "Fallback copy used because live Gemini generation is unavailable or did not pass validation."]
  };
}

function safeFallbackGameReflection(card, result, reason = "No live Gemini response was available.") {
  const detail = result?.summary || "Your result is saved as a personal game result.";
  return {
    reflection: `${detail} That could help you appreciate why ${card.sharedTrait.name.toLowerCase()} matters across several sport families. This is a fan challenge only and does not measure ability or compare you with anyone.`,
    model: "safe-fallback",
    warnings: [reason]
  };
}

function complianceCheckBriefing(briefing) {
  const warnings = [];
  const text = collectStrings(briefing).join(" ");

  const bannedPatterns = [
    /\bguarantee(s|d)?\b/i,
    /\bproduce(s|d)? athletes\b/i,
    /\bcreates? athletes\b/i,
    /\btrain like\b/i,
    /\belite\b/i,
    /\bdiagnostic\b/i,
    /\bassessment\b/i,
    /\bmedal(s|ist|ists)?\b/i,
    /\bfinish time\b/i,
    /\bsport tags?\b/i,
    /\bfeatured cue\b/i,
    /\bcard lens\b/i,
    /\baggregate presence\b/i,
    /\broster data\b/i,
    /\bprominent feature\b/i,
    /\bbackdrop\b/i,
    /\bframes?\b/i,
    /\bframing\b/i,
    /\bcould help fans discover\b/i,
    /\brows?\b/i,
    /\bpipeline\b/i,
    /\bparticipation signal\b/i,
    /\bstate signal\b/i,
    /\bhigh signal\b/i,
    /\bmedium signal\b/i,
    /\blow signal\b/i,
    /\bathletic landscape\b/i,
    /\bfallback\b/i,
    /\btemplate\b/i,
    /\bcard image cue\b/i,
    /\braw data\b/i,
    /\bstrong(?:er|est)?\b/i,
    /\bdominant\b/i,
    /\bbest\b/i,
    /\bproves?\b/i,
    /\bOlympian'?s baseline\b/i,
    /\bParalympian'?s baseline\b/i,
    /\b\d+(\.\d+)?\s?(seconds?|minutes?|points?|percent|%)\b/i
  ];

  for (const pattern of bannedPatterns) {
    if (pattern.test(text)) warnings.push(`Unsafe phrase pattern: ${pattern}`);
  }

  const requiredFields = ["stateScene", "sportMix", "whyInteresting", "geographyLens", "fanHook", "surprisingConnection", "sharedSignal", "exploreNext", "dataSafetyNote", "gameIntro"];
  for (const field of requiredFields) {
    if (typeof briefing[field] === "object") {
      if (!briefing[field] || !Object.keys(briefing[field]).length) warnings.push(`Missing briefing field: ${field}`);
    } else if (!String(briefing[field] || "").trim()) {
      warnings.push(`Missing briefing field: ${field}`);
    }
  }

  const olympicWords = String(briefing.sportMix?.olympic || briefing.olympicNarrative || "").trim().split(/\s+/).filter(Boolean).length;
  const paralympicWords = String(briefing.sportMix?.paralympic || briefing.paralympicNarrative || "").trim().split(/\s+/).filter(Boolean).length;
  if (!olympicWords || !paralympicWords) {
    warnings.push("Both Olympic and Paralympic sport mix sections are required.");
  } else if (Math.max(olympicWords, paralympicWords) > 0) {
    const smaller = Math.min(olympicWords, paralympicWords);
    const larger = Math.max(olympicWords, paralympicWords);
    if (smaller / larger < 0.55) warnings.push("Panel narratives are not similar enough in length.");
  }

  return warnings;
}

function collectStrings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(collectStrings);
  return [];
}

function pickCardFromPayload(dataset, payload) {
  const code = String(payload.stateCode || payload.stateSyncCardJson?.stateCode || "").toUpperCase();
  const incomingCard = payload.stateSyncCardJson;
  if (incomingCard?.stateCode && incomingCard?.stateName) return incomingCard;
  return dataset.states.find((state) => state.stateCode === code) || dataset.states[0];
}

function buildStatePrompt(card) {
  const normalizeCandidate = (candidate) => candidate
    ? { ...candidate, sportTag: displaySportName(candidate.sportTag) }
    : candidate;
  return `You are generating a compliant state insight for a Team USA x Google Cloud Hackathon project.

Use only the provided aggregate data and geography notes.
Do not mention individual athlete names.
Do not use athlete likeness.
Do not mention finish times or specific scoring results.
Do not mention exact counts in the fan-facing briefing.
Do not imply geography causes success.
Do not claim that terrain, climate, or training access guarantees outcomes.
Use conditional language: "may suggest", "could help fans understand", "appears associated with", "could show how".
Write like a sports explainer for curious fans, not like a data policy disclaimer.
The featured card panels already deep-dive on two selected sports. The Gemini State Briefing is the wider state story layer: the state scene, broader sport mix, geography and climate context, fan hooks, surprising connections, shared signal, and what to explore next.
Use all provided topSportTags for Olympic and Paralympic programs as the broader sport mix, but do not use the phrase "sport tags" in the output.
Give Olympic and Paralympic sport mixes equal depth, equal respect, and equal analytical specificity.
If olympicPanel.cardBackCopy or paralympicPanel.cardBackCopy are present, use that Gemini card-back copy as supporting context, but do not simply repeat it.
Do not expose internal implementation terms such as "row", "pipeline", "fallback", "template", "card image cue", "featured cue", "card lens", "sport tag", "sport tags", "raw data", "signal", "participation signal", "aggregate presence", or "athletic landscape".
Avoid overstatement words such as "strong", "dominant", "best", or "proves".
Do not use athlete names, finish times, scores, rankings, medals, or claims that geography causes success.
Do not write bland compliance paragraphs. Use concrete sport context, readable observations, and a few fun fan hooks.
Output concise, scannable, fan-facing copy. Add new insight about the whole state; do not restate the sport-panel copy.

Return valid JSON with these fields:
- stateScene: 1-2 sentences setting up the statewide sport scene.
- sportMix: object with:
  - olympic: 1 sentence naming the broader Olympic side sports and what kind of viewing profile they create.
  - paralympic: 1 sentence naming the broader Paralympic side sports and what kind of viewing profile they create.
- whyInteresting: 1-2 sentences about the state's most interesting fan story.
- geographyLens: 1-2 sentences connecting geography/climate/terrain to fan context with conditional language.
- fanHook: 1 sentence telling fans what to look for across the wider mix.
- surprisingConnection: 1 sentence connecting sports that seem unrelated through a shared hidden skill or viewing idea.
- sharedSignal: 1 sentence naming and explaining the shared signal without implying performance outcomes.
- exploreNext: 1 sentence connecting to the State Sync Challenge as a fan-game interaction only.
- dataSafetyNote: 1 sentence noting aggregate state view and excluded unsafe content.
- gameIntro: 1 sentence safe challenge intro for the challenge screen.
- complianceWarnings

Style target:
State Scene should feel like "California looks like a layered sport map..." but with the actual state.
Sport Mix should be concrete and name sports from the provided lists.
Why It's Interesting and Fan Hook should answer "why would a fan care?"
Geography Lens should use conditional language such as "could help fans understand" or "may suggest".
Do not use the same sentence structure for every state.

State data:
${JSON.stringify({
  stateCode: card.stateCode,
  stateName: card.stateName,
  geographySnapshot: card.geographySnapshot,
  climateSignal: card.climateSignal,
  terrainSignals: card.terrainSignals,
  hometownPresenceBucket: card.hometownPresenceBucket,
  cardStory: card.cardStory,
  sharedTrait: card.sharedTrait,
  olympicPanel: {
    sportFamily: card.olympicPanel?.sportFamily,
    primarySportTag: displaySportName(card.olympicPanel?.primarySportTag),
    topSportTags: (card.olympicPanel?.topSportTags || []).map(displaySportName),
    sportTagCandidates: (card.olympicPanel?.sportTagCandidates || []).map(normalizeCandidate),
    cardBackCopy: card.olympicPanel?.cardBackCopy
  },
  paralympicPanel: {
    sportFamily: card.paralympicPanel?.sportFamily,
    primarySportTag: displaySportName(card.paralympicPanel?.primarySportTag),
    topSportTags: (card.paralympicPanel?.topSportTags || []).map(displaySportName),
    sportTagCandidates: (card.paralympicPanel?.sportTagCandidates || []).map(normalizeCandidate),
    cardBackCopy: card.paralympicPanel?.cardBackCopy
  },
  sourceLabels: (card.sourceRefs || []).map((source) => source.label)
}, null, 2)}`;
}

function buildGamePrompt(card, result) {
  return `You are writing a safe fan-game reflection for a Team USA x Google Cloud Hackathon project.

Use only the provided state trait and personal game result.
Do not compare the user to athletes, Olympians, Paralympians, medalists, teams, training baselines, finish times, or competition scores.
Do not call this a diagnostic, assessment, talent test, or athletic test.
Use conditional fan-appreciation language.
Return valid JSON with fields:
- reflection
- warnings

State trait:
${JSON.stringify(card.sharedTrait, null, 2)}

Personal game result:
${JSON.stringify(result, null, 2)}`;
}

async function callGemini(prompt) {
  if (GOOGLE_CLOUD_PROJECT) return callVertexGemini(prompt);

  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return null;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(key)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.35
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
  return { text, model: GEMINI_MODEL };
}

function vertexEndpoint() {
  const host = GOOGLE_CLOUD_LOCATION === "global"
    ? "https://aiplatform.googleapis.com"
    : `https://${GOOGLE_CLOUD_LOCATION}-aiplatform.googleapis.com`;
  return `${host}/v1/projects/${encodeURIComponent(GOOGLE_CLOUD_PROJECT)}/locations/${encodeURIComponent(GOOGLE_CLOUD_LOCATION)}/publishers/google/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
}

async function getVertexAccessToken() {
  if (process.env.VERTEX_ACCESS_TOKEN) return process.env.VERTEX_ACCESS_TOKEN;
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) return process.env.GOOGLE_OAUTH_ACCESS_TOKEN;

  try {
    const response = await fetch(
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token?scopes=${encodeURIComponent(VERTEX_SCOPE)}`,
      {
        headers: { "Metadata-Flavor": "Google" },
        signal: AbortSignal.timeout(1500)
      }
    );
    if (response.ok) {
      const payload = await response.json();
      if (payload.access_token) return payload.access_token;
    }
  } catch {
    // Not running on Cloud Run/Compute metadata. Try local gcloud below.
  }

  try {
    const { stdout } = await execFileAsync("gcloud", ["auth", "print-access-token"], { timeout: 15000 });
    const token = stdout.trim();
    if (token) return token;
  } catch {
    // Fall through to the explicit setup error below.
  }

  throw new Error("No Vertex AI auth token is available. On Cloud Run, attach a service account with roles/aiplatform.user. Locally, run `gcloud auth login` or set VERTEX_ACCESS_TOKEN.");
}

async function callVertexGemini(prompt) {
  const token = await getVertexAccessToken();
  const response = await fetch(vertexEndpoint(), {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [{ role: "USER", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.35
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vertex Gemini request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
  return { text, model: `${GEMINI_MODEL} via Vertex AI` };
}

async function handleApi(req, res, url) {
  const dataset = await loadDataset();

  if (req.method === "GET" && url.pathname === "/api/states") {
    sendJson(res, 200, dataset);
    return true;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/state/")) {
    const stateCode = decodeURIComponent(url.pathname.split("/").pop()).toUpperCase();
    const card = dataset.states.find((state) => state.stateCode === stateCode);
    if (!card) sendJson(res, 404, { error: `No state card found for ${stateCode}.` });
    else sendJson(res, 200, { meta: dataset.meta, card });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/gemini/state-briefing") {
    const body = await readBody(req);
    const payload = body ? JSON.parse(body) : {};
    const card = pickCardFromPayload(dataset, payload);

    try {
      const gemini = await callGemini(buildStatePrompt(card));
      if (!gemini) {
        sendJson(res, 200, {
          source: "fallback",
          model: "safe-fallback",
          briefing: safeFallbackBriefing(card, "Set GEMINI_API_KEY or GOOGLE_API_KEY to enable live Gemini generation."),
          complianceWarnings: ["Live Gemini is not configured."]
        });
        return true;
      }

      const briefing = JSON.parse(normalizeJsonText(gemini.text));
      const warnings = complianceCheckBriefing(briefing).concat(briefing.complianceWarnings || []);
      if (warnings.length > 0) {
        sendJson(res, 200, {
          source: "fallback-after-validation",
          model: gemini.model,
          briefing: safeFallbackBriefing(card, "Gemini output was replaced after local compliance validation."),
          complianceWarnings: warnings
        });
        return true;
      }

      sendJson(res, 200, {
        source: "gemini",
        model: gemini.model,
        briefing,
        complianceWarnings: []
      });
    } catch (error) {
      sendJson(res, 200, {
        source: "fallback-after-error",
        model: GEMINI_MODEL,
        briefing: safeFallbackBriefing(card, error.message),
        complianceWarnings: [error.message]
      });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/gemini/game-reflection") {
    const body = await readBody(req);
    const payload = body ? JSON.parse(body) : {};
    const card = pickCardFromPayload(dataset, payload);
    const result = payload.result || {};

    try {
      const gemini = await callGemini(buildGamePrompt(card, result));
      if (!gemini) {
        sendJson(res, 200, safeFallbackGameReflection(card, result, "Set GEMINI_API_KEY or GOOGLE_API_KEY to enable live Gemini generation."));
        return true;
      }

      const parsed = JSON.parse(normalizeJsonText(gemini.text));
      const text = String(parsed.reflection || "");
      const unsafe = /\b(compare|diagnostic|assessment|athletic test|train like|baseline|medal|elite)\b/i.test(text);
      if (unsafe) {
        sendJson(res, 200, safeFallbackGameReflection(card, result, "Gemini game reflection was replaced after local compliance validation."));
        return true;
      }

      sendJson(res, 200, {
        reflection: parsed.reflection,
        model: gemini.model,
        warnings: parsed.warnings || []
      });
    } catch (error) {
      sendJson(res, 200, safeFallbackGameReflection(card, result, error.message));
    }
    return true;
  }

  return false;
}

async function serveStatic(req, res, url) {
  const root = await staticRoot();
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const normalized = path.normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(root, normalized);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600"
    });
    res.end(data);
  } catch (error) {
    if (error.code === "ENOENT" && root === DIST_DIR) {
      filePath = path.join(DIST_DIR, "index.html");
      const data = await readFile(filePath);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      });
      res.end(data);
      return;
    }

    if (error.code === "ENOENT") {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
    } else {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(error.message);
    }
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApi(req, res, url);
      if (!handled) sendJson(res, 404, { error: "Unknown API route." });
      return;
    }

    await serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Common Ground API/static server running at http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}`);
});

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
