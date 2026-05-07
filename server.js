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
const FIREBASE_SESSION_COOKIE = "common_ground_session";
const FIREBASE_SESSION_DAYS_VALUE = Number(process.env.FIREBASE_SESSION_DAYS || 5);
const FIREBASE_SESSION_DAYS = Number.isFinite(FIREBASE_SESSION_DAYS_VALUE) ? FIREBASE_SESSION_DAYS_VALUE : 5;
const FIREBASE_SESSION_EXPIRES_IN_MS = Math.min(
  Math.max(FIREBASE_SESSION_DAYS * 24 * 60 * 60 * 1000, 5 * 60 * 1000),
  14 * 24 * 60 * 60 * 1000
);
const FIREBASE_SESSION_MAX_AGE_SECONDS = Math.round(FIREBASE_SESSION_EXPIRES_IN_MS / 1000);

let cachedDataset;
let cachedStaticRoot;
let firebaseAdminPromise;

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

function readGoogleApplicationCredentials() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) return null;
  try {
    return JSON.parse(readFileSync(credentialsPath, "utf8"));
  } catch {
    return null;
  }
}

async function getFirebaseAdmin() {
  if (!firebaseAdminPromise) {
    firebaseAdminPromise = (async () => {
      const [
        { applicationDefault, getApps, initializeApp },
        { getAuth },
        { FieldValue, getFirestore }
      ] = await Promise.all([
        import("firebase-admin/app"),
        import("firebase-admin/auth"),
        import("firebase-admin/firestore")
      ]);

      const credentials = readGoogleApplicationCredentials();
      const projectId = process.env.FIREBASE_PROJECT_ID || credentials?.project_id || process.env.GCLOUD_PROJECT || GOOGLE_CLOUD_PROJECT;
      const app = getApps()[0] || initializeApp({
        credential: applicationDefault(),
        projectId
      });

      return {
        auth: getAuth(app),
        db: getFirestore(app),
        FieldValue
      };
    })();
  }

  return firebaseAdminPromise;
}

function parseCookies(cookieHeader = "") {
  function decode(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return [part, ""];
        return [
          decode(part.slice(0, index)),
          decode(part.slice(index + 1))
        ];
      })
  );
}

function sessionCookieFlags(maxAgeSeconds) {
  const secure = process.env.FIREBASE_SESSION_COOKIE_SECURE === "true"
    || Boolean(process.env.K_SERVICE)
    || process.env.NODE_ENV === "production";
  return [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
    secure ? "Secure" : ""
  ].filter(Boolean).join("; ");
}

function setSessionCookie(res, value) {
  res.setHeader("Set-Cookie", `${FIREBASE_SESSION_COOKIE}=${encodeURIComponent(value)}; ${sessionCookieFlags(FIREBASE_SESSION_MAX_AGE_SECONDS)}`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${FIREBASE_SESSION_COOKIE}=; ${sessionCookieFlags(0)}`);
}

function userFromDecodedToken(decoded) {
  return {
    uid: decoded.uid || decoded.sub,
    email: decoded.email || "",
    name: decoded.name || decoded.email || "Common Ground fan",
    firstName: "",
    lastName: "",
    photoURL: decoded.picture || "",
    emailVerified: Boolean(decoded.email_verified),
    signInProvider: decoded.firebase?.sign_in_provider || ""
  };
}

function cleanNamePart(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

function splitDisplayName(name = "", email = "") {
  const source = cleanNamePart(name) || cleanNamePart(String(email || "").split("@")[0].replace(/[._-]+/g, " "));
  const parts = source.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ")
  };
}

function userWithProfile(decoded, profile = {}) {
  const baseUser = userFromDecodedToken(decoded);
  const firstName = cleanNamePart(profile.firstName);
  const lastName = cleanNamePart(profile.lastName);
  const name = [firstName, lastName].filter(Boolean).join(" ") || baseUser.name;

  return {
    ...baseUser,
    name,
    firstName,
    lastName
  };
}

async function upsertUserProfile(decoded, incomingProfile = {}) {
  const { db, FieldValue } = await getFirebaseAdmin();
  const baseUser = userFromDecodedToken(decoded);
  const profileRef = db.collection("userProfiles").doc(baseUser.uid);
  const snapshot = await profileRef.get();
  const existing = snapshot.exists ? snapshot.data() : {};
  const derived = splitDisplayName(baseUser.name, baseUser.email);

  const firstName = cleanNamePart(incomingProfile.firstName) || cleanNamePart(existing.firstName) || derived.firstName;
  const lastName = cleanNamePart(incomingProfile.lastName) || cleanNamePart(existing.lastName) || derived.lastName;
  const profile = {
    email: baseUser.email,
    firstName,
    lastName,
    name: [firstName, lastName].filter(Boolean).join(" ") || baseUser.name,
    photoURL: baseUser.photoURL,
    signInProvider: baseUser.signInProvider,
    updatedAt: FieldValue.serverTimestamp()
  };

  if (!snapshot.exists) profile.createdAt = FieldValue.serverTimestamp();
  await profileRef.set(profile, { merge: true });
  return userWithProfile(decoded, profile);
}

function bearerToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

async function currentAuthUser(req) {
  const { auth } = await getFirebaseAdmin();
  const token = bearerToken(req);
  if (token) {
    const decoded = await auth.verifyIdToken(token);
    return userFromDecodedToken(decoded);
  }

  const cookies = parseCookies(req.headers.cookie || "");
  const sessionCookie = cookies[FIREBASE_SESSION_COOKIE];
  if (!sessionCookie) return null;

  const checkRevoked = process.env.FIREBASE_SESSION_CHECK_REVOKED === "true";
  const decoded = await auth.verifySessionCookie(sessionCookie, checkRevoked);
  return userFromDecodedToken(decoded);
}

function normalizeCodeList(value, dataset) {
  const allowed = new Set((dataset.states || []).map((state) => state.stateCode));
  return [
    ...new Set(
      (Array.isArray(value) ? value : [])
        .map((code) => String(code || "").trim().toUpperCase())
        .filter((code) => allowed.has(code))
    )
  ];
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

function lowerFirst(value = "") {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : "";
}

function displaySportName(value) {
  const text = String(value || "").trim();
  if (/^paratriathlon$/i.test(text)) return "Para triathlon";
  return text;
}

function plainTraitDescription(cardOrTrait) {
  const trait = cardOrTrait?.sharedTrait || cardOrTrait || {};
  return String(trait.description || "The featured sports share a similar mix of timing, control, and adaptation.").trim();
}

function plainTraitHeadline(cardOrTrait) {
  const trait = cardOrTrait?.sharedTrait || cardOrTrait || {};
  const source = `${trait.name || ""} ${trait.description || ""}`.toLowerCase();
  const hasChangingContext = /\b(conditions?|surfaces?|transitions?|water|roads?)\b/.test(source);
  if (/\b(focus|precision)\b/.test(source)) return "Focus and precision";
  if (/\b(elevation|mountain|terrain|weather|equipment)\b/.test(source) && /\b(pace|pacing|control|decisions?)\b/.test(source)) return "Pacing through terrain and equipment changes";
  if (/\b(pace|pacing|cadence|rhythm|timing)\b/.test(source) && hasChangingContext) return "Adjusting rhythm as conditions change";
  if (/\b(pace|pacing|cadence|rhythm)\b/.test(source)) return "Rhythm and pacing";
  if (/\b(space|spacing|recognition)\b/.test(source)) return "Timing and space awareness";
  if (/\b(pressure|power|body control|short window|well-timed)\b/.test(source)) return "Control under pressure";
  if (/\b(signal|signals|source context)\b/.test(source)) return "Explore the available roster context";
  if (/\b(timing)\b/.test(source)) return "Clean timing";
  return plainTraitDescription(trait).replace(/[.!?]+$/, "");
}

function panelSportList(panel) {
  const sports = panel?.allSportTags?.length ? panel.allSportTags : panel?.topSportTags;
  return (sports || []).map(displaySportName);
}

function panelFeaturedSportList(panel, limit = 3) {
  const sports = panel?.topSportTags?.length ? panel.topSportTags : panelSportList(panel);
  return (sports || []).slice(0, limit).map(displaySportName);
}

function datasetLabelForCard(card) {
  const scopeId = card?.dataScopeId || "both";
  if (scopeId === "paris2024") return "Paris 2024 dataset";
  if (scopeId === "milanoCortina2026") return "Milano Cortina 2026 dataset";
  if (scopeId === "both") return "combined Paris 2024 and Milano Cortina 2026 dataset";
  return "selected Team USA dataset";
}

function sportMixPreviewDetail(card, panel, programLabel) {
  const allSports = panelSportList(panel);
  const featuredSports = panelFeaturedSportList(panel);
  const stateName = card?.stateName || "This state";
  const datasetLabel = datasetLabelForCard(card);
  if (!allSports.length) return `${panel?.sportFamily || "No sourced sport-family view"} appears in the ${datasetLabel}.`;
  if (allSports.length > featuredSports.length) {
    return `${stateName} includes ${allSports.length} ${programLabel} sports from the ${datasetLabel}. Featured examples: ${joinReadableList(featuredSports)}.`;
  }
  return `${stateName} includes ${joinReadableList(allSports)} from the ${datasetLabel}.`;
}

function safeFallbackBriefing(card, reason = "No live Gemini response was available.") {
  const olympicCue = displaySportName(card.olympicPanel.primarySportTag || card.olympicPanel.topSportTags?.[0] || card.olympicPanel.sportFamily);
  const paralympicCue = displaySportName(card.paralympicPanel.primarySportTag || card.paralympicPanel.topSportTags?.[0] || card.paralympicPanel.sportFamily);
  const geography = card.cardStory?.geographySignal?.length
    ? joinReadableList(card.cardStory.geographySignal)
    : card.geographySnapshot;
  return {
    stateSnapshot: `In the public aggregate Team USA state data, ${card.stateName} shows Olympic and Paralympic sport lists from the ${datasetLabelForCard(card)}, with featured card examples from ${olympicCue} and ${paralympicCue}. That does not mean ${card.stateName} geography causes outcomes; it gives fans a safer way to explore why different sport environments appear in one state view.`,
    sportMix: [
      {
        theme: "Olympic sports",
        detail: sportMixPreviewDetail(card, card.olympicPanel, "Olympic")
      },
      {
        theme: "Paralympic sports",
        detail: sportMixPreviewDetail(card, card.paralympicPanel, "Paralympic")
      },
      {
        theme: "Movement themes",
        detail: `Across the combined state view, fans can look for rhythm, spacing, pacing, precision, equipment control, and surface changes.`
      }
    ],
    geographyLens: `${card.geographySnapshot} could help fans understand why varied sport environments appear in this aggregate state view.`,
    hometownAreas: formatHometownAreas(card.topHometownSignals),
    whatToNotice: `The useful fan read is contrast: some sports emphasize spacing and quick decisions, while others emphasize rhythm, stillness, pacing, equipment, or transitions.`,
    surprisingConnection: `${olympicCue} and ${paralympicCue} do not need to look alike to share a viewing idea; both can point fans toward control when timing, surface, or spacing changes.`,
    sharedStateSignal: plainTraitDescription(card),
    gameIntro: `Try a short fan challenge inspired by ${lowerFirst(plainTraitHeadline(card))}.`,
    complianceWarnings: [reason, "Fallback copy used because live Gemini generation is unavailable or did not pass validation."]
  };
}

function completeSportMixItems(card) {
  return [
    panelSportList(card?.olympicPanel).length
      ? {
        theme: "Olympic sports",
        detail: sportMixPreviewDetail(card, card?.olympicPanel, "Olympic")
      }
      : null,
    panelSportList(card?.paralympicPanel).length
      ? {
        theme: "Paralympic sports",
        detail: sportMixPreviewDetail(card, card?.paralympicPanel, "Paralympic")
      }
      : null
  ].filter(Boolean);
}

function briefingWithCompleteSportMix(briefing, card) {
  const completeItems = completeSportMixItems(card);
  const generatedItems = Array.isArray(briefing?.sportMix) ? briefing.sportMix : [];
  const thematicItems = generatedItems
    .filter((item) => !/^(Olympic|Paralympic)(-side)? sports$/i.test(String(item?.theme || "")))
    .slice(0, Math.max(1, 5 - completeItems.length));
  return {
    ...briefing,
    sportMix: [...completeItems, ...thematicItems],
    sharedStateSignal: plainTraitDescription(card)
  };
}

function formatHometownAreas(signals = []) {
  return (signals || []).slice(0, 3).map((area) => ({
    area: area.label,
    detail: `${area.total} public Team USA athlete records list ${area.label} as their hometown (${area.olympic} Olympic-side, ${area.paralympic} Paralympic-side).`
  }));
}

function safeFallbackGameReflection(card, result, reason = "No live Gemini response was available.") {
  const detail = result?.summary || "Your result is saved as a personal game result.";
  return {
    reflection: `${detail} That could help you appreciate how ${lowerFirst(plainTraitDescription(card))} can matter across several sport families. This is a fan challenge only and does not measure ability or compare you with anyone.`,
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
    ...(panel?.allSportTags || []),
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

function stripRecordCounts(value) {
  if (Array.isArray(value)) return value.map(stripRecordCounts);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "recordCount" && key !== "featuredSportRecordCount")
      .map(([key, entry]) => [key, stripRecordCounts(entry)])
  );
}

function pickCardFromPayload(dataset, payload) {
  const code = String(payload.stateCode || payload.stateSyncCardJson?.stateCode || "").toUpperCase();
  const incomingCard = payload.stateSyncCardJson;
  if (incomingCard?.stateCode && incomingCard?.stateName) return incomingCard;
  return dataset.states.find((state) => state.stateCode === code) || dataset.states[0];
}

function buildStatePrompt(card) {
  const normalizeCandidate = (candidate) => candidate
    ? { ...stripRecordCounts(candidate), sportTag: displaySportName(candidate.sportTag) }
    : candidate;
  return `You are generating a compliant state insight for a Team USA x Google Cloud Hackathon project.

Use only the provided aggregate data and geography notes.
Do not mention individual athlete names.
Do not use athlete likeness.
Do not mention finish times or specific scoring results.
Do not mention exact counts except the provided topHometownSignals city entries, and label those as public Team USA athlete hometown records, not a complete athlete census.
Do not imply geography causes success.
Do not claim that terrain, climate, or training access guarantees outcomes.
Use conditional language: "may suggest", "could help fans understand", "appears associated with", "could show how".
Write like a sports explainer for curious fans, not like a data policy disclaimer.
The featured card panels already deep-dive on two selected sports. The Gemini State Briefing is the wider state story layer: state snapshot, broader sport mix grouped by theme, geography lens, what to notice, a surprising connection, and one shared card thread.
Use allSportTags as the complete selected-data-view sport list, but do not enumerate the full list in paragraph copy. The application renders that full list behind a See all control. Treat topSportTags, primarySportTag, and cardStory featured sports as featured card lenses for concise examples. Do not use the phrase "sport tags" in the output.
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
- hometownAreas: array of up to 3 objects. If topHometownSignals are provided, each object has:
  - area: the city/area label from the provided data.
  - detail: 1 sentence with its provided total public Team USA athlete records listing that area as hometown plus Olympic-side and Paralympic-side entries. Say "records", not "athletes", and do not imply this is a complete athlete census.
- geographyLens: 1-2 sentences connecting geography/climate/terrain to fan context with conditional language.
- whatToNotice: 2-3 sentences with concrete fan viewing observations across the broader sport mix.
- surprisingConnection: 1-2 sentences. Choose one surprising connection across the broader state sport mix. Prefer one Olympic-side sport and one Paralympic-side sport, but do not force the featured card pair if another connection is more interesting.
- sharedStateSignal: 1 plain-English sentence explaining why the two featured sports connect. Lead with the description, not a coined trait name, and do not use the phrase "state signal" or imply performance outcomes.
- gameIntro: 1 sentence safe challenge intro for the challenge screen.
- complianceWarnings

Style target:
State Snapshot should feel like "In the public aggregate state data, California shows..." and should not sound guaranteed.
Sport Mix should be concrete, grouped by theme, and name more sports than the two featured sports when available.
Hometown Areas should only use provided topHometownSignals. Do not infer counties and do not create city names.
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
  topHometownSignals: card.topHometownSignals || [],
  cardStory: stripRecordCounts(card.cardStory),
  sportConnection: {
    headline: plainTraitHeadline(card),
    description: plainTraitDescription(card)
  },
  olympicPanel: {
    sportFamily: card.olympicPanel?.sportFamily,
    primarySportTag: displaySportName(card.olympicPanel?.primarySportTag),
    allSportTags: panelSportList(card.olympicPanel),
    topSportTags: (card.olympicPanel?.topSportTags || []).map(displaySportName),
    sportTagCandidates: (card.olympicPanel?.sportTagCandidates || []).map(normalizeCandidate),
    cardBackCopy: card.olympicPanel?.cardBackCopy
  },
  paralympicPanel: {
    sportFamily: card.paralympicPanel?.sportFamily,
    primarySportTag: displaySportName(card.paralympicPanel?.primarySportTag),
    allSportTags: panelSportList(card.paralympicPanel),
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
Do not mention individual athlete names, athlete likeness, finish times, scores, rankings, medals, exact state/program totals, or performance predictions.
Exact counts are allowed only inside hometownAreas when copied from provided topHometownSignals, and must be called public hometown entries.
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
- hometownAreas: array of up to 3 objects with area and detail
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
  topHometownSignals: card.topHometownSignals || [],
  olympicSports: panelSportList(card.olympicPanel),
  paralympicSports: panelSportList(card.paralympicPanel),
  sportConnection: {
    headline: plainTraitHeadline(card),
    description: plainTraitDescription(card)
  }
}, null, 2)}

Rejected briefing:
${JSON.stringify(briefing, null, 2)}`;
}

function buildGamePrompt(card, result) {
  return `You are writing a safe fan-game reflection for a Team USA x Google Cloud Hackathon project.

Use only the provided plain sport connection and personal game result.
Do not use coined trait names such as "Waterline Control"; explain the connection in plain language.
Do not compare the user to athletes, Olympians, Paralympians, medalists, teams, training baselines, finish times, or competition scores.
Do not call this a diagnostic, assessment, talent test, or athletic test.
Use conditional fan-appreciation language.
Return valid JSON with fields:
- reflection
- warnings

Plain sport connection:
${plainTraitDescription(card)}

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

  if (req.method === "POST" && url.pathname === "/api/auth/session") {
    const body = await readBody(req);
    const payload = body ? JSON.parse(body) : {};
    const idToken = String(payload.idToken || "");
    if (!idToken) {
      sendJson(res, 400, { error: "Missing Firebase ID token." });
      return true;
    }

    try {
      const { auth } = await getFirebaseAdmin();
      const decoded = await auth.verifyIdToken(idToken);
      const user = await upsertUserProfile(decoded, payload.profile);
      const sessionCookie = await auth.createSessionCookie(idToken, {
        expiresIn: FIREBASE_SESSION_EXPIRES_IN_MS
      });
      setSessionCookie(res, sessionCookie);
      sendJson(res, 200, {
        user,
        expiresIn: FIREBASE_SESSION_MAX_AGE_SECONDS
      });
    } catch (error) {
      clearSessionCookie(res);
      sendJson(res, 401, { error: `Firebase session could not be created: ${error.message}` });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/session") {
    try {
      const user = await currentAuthUser(req);
      if (!user) {
        sendJson(res, 401, { error: "No active session." });
        return true;
      }
      sendJson(res, 200, { user });
    } catch (error) {
      clearSessionCookie(res);
      sendJson(res, 401, { error: `Session is not valid: ${error.message}` });
    }
    return true;
  }

  if (req.method === "DELETE" && url.pathname === "/api/auth/session") {
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (url.pathname === "/api/user/collection" && (req.method === "GET" || req.method === "PUT")) {
    let user;
    try {
      user = await currentAuthUser(req);
    } catch (error) {
      clearSessionCookie(res);
      sendJson(res, 401, { error: `Session is not valid: ${error.message}` });
      return true;
    }

    if (!user) {
      sendJson(res, 401, { error: "Log in to sync your collection." });
      return true;
    }

    const { db, FieldValue } = await getFirebaseAdmin();
    const collectionRef = db.collection("userCollections").doc(user.uid);

    if (req.method === "GET") {
      const snapshot = await collectionRef.get();
      const data = snapshot.exists ? snapshot.data() : {};
      sendJson(res, 200, {
        discoveredCodes: normalizeCodeList(data.discoveredCodes || ["CO"], dataset),
        playedCodes: normalizeCodeList(data.playedCodes || [], dataset),
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || null
      });
      return true;
    }

    const body = await readBody(req);
    const payload = body ? JSON.parse(body) : {};
    const discoveredCodes = normalizeCodeList(payload.discoveredCodes || ["CO"], dataset);
    const playedCodes = normalizeCodeList(payload.playedCodes || [], dataset);

    await collectionRef.set({
      discoveredCodes: discoveredCodes.length ? discoveredCodes : ["CO"],
      playedCodes,
      uid: user.uid,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    sendJson(res, 200, {
      discoveredCodes: discoveredCodes.length ? discoveredCodes : ["CO"],
      playedCodes
    });
    return true;
  }

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

      const briefing = briefingWithCompleteSportMix(JSON.parse(normalizeJsonText(gemini.text)), card);
      const validationWarnings = complianceCheckBriefing(briefing, card);
      if (validationWarnings.length > 0) {
        try {
          const repairedGemini = await callGemini(buildBriefingRepairPrompt(card, briefing, validationWarnings));
          if (repairedGemini) {
            const repairedBriefing = briefingWithCompleteSportMix(JSON.parse(normalizeJsonText(repairedGemini.text)), card);
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
