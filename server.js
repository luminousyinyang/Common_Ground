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
  const olympicTags = (card.olympicPanel.topSportTags || []).map(displaySportName);
  const paralympicTags = (card.paralympicPanel.topSportTags || []).map(displaySportName);
  const olympicMix = joinReadableList(olympicTags);
  const paralympicMix = joinReadableList(paralympicTags);
  const olympicCue = displaySportName(card.olympicPanel.primarySportTag || card.olympicPanel.topSportTags?.[0] || card.olympicPanel.sportFamily);
  const paralympicCue = displaySportName(card.paralympicPanel.primarySportTag || card.paralympicPanel.topSportTags?.[0] || card.paralympicPanel.sportFamily);
  const geography = card.cardStory?.geographySignal?.length
    ? joinReadableList(card.cardStory.geographySignal)
    : card.geographySnapshot;
  return {
    stateSnapshot: `In the public aggregate Team USA state data, ${card.stateName} shows a sport mix shaped by ${olympicMix || card.olympicPanel.sportFamily} on the Olympic side and ${paralympicMix || card.paralympicPanel.sportFamily} on the Paralympic side. That does not mean ${card.stateName} geography causes outcomes; it gives fans a safer way to explore why different sport environments appear in one state view.`,
    sportMix: [
      {
        theme: "Olympic-side mix",
        detail: olympicMix ? `${olympicMix} appear in the Olympic side of this aggregate state view.` : `${card.olympicPanel.sportFamily} appears as the Olympic-side sport-family view.`
      },
      {
        theme: "Paralympic-side mix",
        detail: paralympicMix ? `${paralympicMix} appear in the Paralympic side of this aggregate state view.` : `${card.paralympicPanel.sportFamily} appears as the Paralympic-side sport-family view.`
      },
      {
        theme: "Movement themes",
        detail: `Across the combined state view, fans can look for rhythm, spacing, pacing, precision, equipment control, and surface changes.`
      }
    ],
    geographyLens: `${card.geographySnapshot} could help fans understand why varied sport environments appear in this aggregate state view.`,
    whatToNotice: `The useful fan read is contrast: some sports emphasize spacing and quick decisions, while others emphasize rhythm, stillness, pacing, equipment, or transitions.`,
    surprisingConnection: `${olympicCue} and ${paralympicCue} do not need to look alike to share a viewing idea; both can point fans toward control when timing, surface, or spacing changes.`,
    sharedStateSignal: `${card.sharedTrait.name}: ${card.sharedTrait.description}`,
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

function complianceCheckBriefing(briefing, card) {
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

  const requiredFields = ["stateSnapshot", "sportMix", "geographyLens", "whatToNotice", "surprisingConnection", "sharedStateSignal", "gameIntro"];
  for (const field of requiredFields) {
    if (typeof briefing[field] === "object") {
      if (!briefing[field] || !Object.keys(briefing[field]).length) warnings.push(`Missing briefing field: ${field}`);
    } else if (!String(briefing[field] || "").trim()) {
      warnings.push(`Missing briefing field: ${field}`);
    }
  }

  const sportMixText = collectStrings(briefing.sportMix || []).join(" ");
  const hasOlympicContext = /Olympic/i.test(sportMixText)
    || textIncludesAnySport(sportMixText, sportNamesForProgram(card, "olympic"));
  const hasParalympicContext = /Paralympic/i.test(sportMixText)
    || textIncludesAnySport(sportMixText, sportNamesForProgram(card, "paralympic"));
  if (!hasOlympicContext || !hasParalympicContext) {
    warnings.push("Sport Mix must include both Olympic and Paralympic context.");
  }

  return warnings;
}

function normalizeMatchText(value) {
  return displaySportName(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function textIncludesAnySport(text, sportNames) {
  const normalizedText = normalizeMatchText(text);
  return sportNames.some((sportName) => {
    const normalizedSport = normalizeMatchText(sportName);
    return normalizedSport.length > 2 && normalizedText.includes(normalizedSport);
  });
}

function sportNamesForProgram(card, program) {
  const panel = program === "paralympic" ? card?.paralympicPanel : card?.olympicPanel;
  return [
    panel?.primarySportTag,
    ...(panel?.topSportTags || []),
    ...(panel?.sportTagCandidates || []).map((candidate) => candidate?.sportTag),
    panel?.cardBackCopy?.sportName
  ].filter(Boolean);
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
The featured card panels already deep-dive on two selected sports. The Gemini State Briefing is the wider state story layer: state snapshot, broader sport mix grouped by theme, geography lens, what to notice, a surprising connection, and one shared card thread.
Use all provided topSportTags for Olympic and Paralympic programs as the broader sport mix, but do not use the phrase "sport tags" in the output.
Give Olympic and Paralympic sport mixes equal depth, equal respect, and equal analytical specificity.
If olympicPanel.cardBackCopy or paralympicPanel.cardBackCopy are present, use that Gemini card-back copy as supporting context, but do not simply repeat it.
Do not expose internal implementation terms such as "row", "pipeline", "fallback", "template", "card image cue", "featured cue", "card lens", "sport tag", "sport tags", "raw data", "signal", "participation signal", "aggregate presence", or "athletic landscape".
Do not use these weak or internal-sounding words and phrases: "backdrop", "frame", "framing", "could help fans discover", "state signal", "high signal", "medium signal", "low signal".
Avoid overstatement words such as "strong", "dominant", "best", or "proves".
Do not use athlete names, finish times, scores, rankings, medals, or claims that geography causes success.
Do not write bland compliance paragraphs. Use concrete sport context, readable observations, and a few fun fan hooks.
Output concise, scannable, fan-facing copy. Add new insight about the whole state; do not restate the sport-panel copy.
Do not imply these sports are all trained in the state or caused by state geography. Use phrases such as "appears in the public aggregate state data", "state view", "could help fans explore", and "may suggest a fan-discovery lens."

Return valid JSON with these fields:
- stateSnapshot: 2-3 sentences starting with "In the public aggregate Team USA state data..." or similar safe wording. It should explain the broad state view without implying geography causes outcomes.
- sportMix: array of 3-5 objects. Each object has:
  - theme: a short label such as "Aquatic and transition", "Road and endurance", "Precision and control", "Urban and balance", "Team spacing".
  - detail: 1 sentence grouping multiple sports by theme. Use sports from both Olympic and Paralympic lists when possible.
- geographyLens: 1-2 sentences connecting geography/climate/terrain to fan context with conditional language.
- whatToNotice: 2-3 sentences with concrete fan viewing observations across the broader sport mix.
- surprisingConnection: 1-2 sentences. Choose one surprising connection across the broader state sport mix. Prefer one Olympic-side sport and one Paralympic-side sport, but do not force the featured card pair if another connection is more interesting.
- sharedStateSignal: 1 sentence naming and explaining the shared card thread without using the phrase "state signal" or implying performance outcomes.
- gameIntro: 1 sentence safe challenge intro for the challenge screen.
- complianceWarnings

Style target:
State Snapshot should feel like "In the public aggregate state data, California shows..." and should not sound guaranteed.
Sport Mix should be concrete, grouped by theme, and name more sports than the two featured sports when available.
What To Notice should answer "what did I actually learn?"
Geography Lens should use conditional language such as "could help fans understand" or "may suggest".
Surprising Connection should be dynamic, not always the two featured sports.
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

function buildBriefingRepairPrompt(card, briefing, validationWarnings) {
  return `Rewrite this Gemini State Briefing JSON so it passes the local compliance validator.

Keep the same JSON schema and the same state/sport meaning.
Use only the provided aggregate state data and the rejected briefing as context.
Do not mention individual athlete names, athlete likeness, finish times, scores, rankings, medals, exact counts, or performance predictions.
Do not imply geography causes athletic outcomes.
Use conditional wording such as "may suggest", "could help fans understand", "appears in the state view", and "could show how".
Remove every word or phrase flagged by the validator. In particular, do not use any form of "guarantee", "frame", "framing", "backdrop", "signal", "row", "roster data", "athletic landscape", "dominant", "best", or "strong".
Use "does not imply performance outcomes" instead of any sentence containing the word "guarantee".
Use "could help fans understand" or "could show how" instead of "frame", "framing", or "backdrop".
For complianceWarnings, return an empty array unless there is a real unresolved issue.

Return valid JSON with these exact fields:
- stateSnapshot
- sportMix: array of 3-5 objects with theme and detail
- geographyLens
- whatToNotice
- surprisingConnection
- sharedStateSignal
- gameIntro
- complianceWarnings

Validation warnings to fix:
${JSON.stringify(validationWarnings, null, 2)}

State context:
${JSON.stringify({
  stateCode: card.stateCode,
  stateName: card.stateName,
  geographySnapshot: card.geographySnapshot,
  olympicSports: (card.olympicPanel?.topSportTags || []).map(displaySportName),
  paralympicSports: (card.paralympicPanel?.topSportTags || []).map(displaySportName),
  sharedTrait: card.sharedTrait
}, null, 2)}

Rejected briefing:
${JSON.stringify(briefing, null, 2)}`;
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

  const token = await getGcloudAccessToken();
  if (token) return token;

  throw new Error("No Vertex AI auth token is available. On Cloud Run, attach a service account with roles/aiplatform.user. Locally, run `gcloud auth login` or set VERTEX_ACCESS_TOKEN.");
}

async function getGcloudAccessToken() {
  const attempts = [
    { command: "gcloud", args: ["auth", "print-access-token"] },
    { command: "/opt/homebrew/bin/gcloud", args: ["auth", "print-access-token"] },
    { command: "/usr/local/bin/gcloud", args: ["auth", "print-access-token"] },
    {
      command: "/bin/zsh",
      args: [
        "-lc",
        "source \"$(brew --prefix 2>/dev/null)/share/google-cloud-sdk/path.zsh.inc\" 2>/dev/null || true; export CLOUDSDK_PYTHON=${CLOUDSDK_PYTHON:-/usr/bin/python3}; gcloud auth print-access-token"
      ]
    }
  ];

  for (const attempt of attempts) {
    try {
      const { stdout } = await execFileAsync(attempt.command, attempt.args, { timeout: 15000 });
      const token = stdout.trim();
      if (token) return token;
    } catch {
      // Try the next local auth strategy.
    }
  }

  return null;
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
      const validationWarnings = complianceCheckBriefing(briefing, card);
      if (validationWarnings.length > 0) {
        try {
          const repairedGemini = await callGemini(buildBriefingRepairPrompt(card, briefing, validationWarnings));
          if (repairedGemini) {
            const repairedBriefing = JSON.parse(normalizeJsonText(repairedGemini.text));
            const repairedWarnings = complianceCheckBriefing(repairedBriefing, card);
            if (repairedWarnings.length === 0) {
              sendJson(res, 200, {
                source: "gemini-rewrite",
                model: repairedGemini.model,
                briefing: repairedBriefing,
                complianceWarnings: repairedBriefing.complianceWarnings || []
              });
              return true;
            }
          }
        } catch {
          // Fall back below with the original local validation warnings.
        }

        sendJson(res, 200, {
          source: "fallback-after-validation",
          model: gemini.model,
          briefing: safeFallbackBriefing(card, "Gemini output was replaced after local compliance validation."),
          complianceWarnings: validationWarnings
        });
        return true;
      }

      sendJson(res, 200, {
        source: "gemini",
        model: gemini.model,
        briefing,
        complianceWarnings: briefing.complianceWarnings || []
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
