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
const GAME_REFLECTION_MODEL = process.env.GAME_REFLECTION_MODEL || process.env.GEMINI_GAME_MODEL || "gemini-3.1-flash-lite";
const BRIEFING_REPAIR_ATTEMPTS = 2;
const VERTEX_REQUEST_MAX_ATTEMPTS = positiveInteger(process.env.VERTEX_API_MAX_ATTEMPTS || process.env.VERTEX_REQUEST_MAX_ATTEMPTS, 3);
const VERTEX_REQUEST_TIMEOUT_MS = positiveInteger(process.env.VERTEX_API_TIMEOUT_MS || process.env.VERTEX_REQUEST_TIMEOUT_MS, 45000);
const VERTEX_RETRY_DELAY_MS = positiveInteger(process.env.VERTEX_API_RETRY_DELAY_MS || process.env.VERTEX_RETRY_DELAY_MS, 750);
const VERTEX_RATE_LIMIT_RETRY_DELAY_MS = positiveInteger(process.env.VERTEX_API_RATE_LIMIT_RETRY_DELAY_MS || process.env.VERTEX_RATE_LIMIT_RETRY_DELAY_MS, 2000);
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
const SCORE_HISTORY_GAME_TYPES = new Set(["reaction_grid", "cadence_keeper", "precision_trace", "focus_hold", "pattern_scout"]);
const DEFAULT_SCORE_HISTORY_LIMIT = 50;
const MAX_SCORE_HISTORY_LIMIT = 100;

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
      const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || credentials?.project_id || process.env.GCLOUD_PROJECT || GOOGLE_CLOUD_PROJECT;
      const serviceAccountId = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT || credentials?.client_email || "";
      const appOptions = {
        credential: applicationDefault(),
        projectId
      };
      if (serviceAccountId) appOptions.serviceAccountId = serviceAccountId;
      const app = getApps()[0] || initializeApp(appOptions);

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

function normalizeScoreHistoryGameType(value = "") {
  const gameType = String(value || "").trim();
  return SCORE_HISTORY_GAME_TYPES.has(gameType) ? gameType : "";
}

function scoreHistoryGameTypeFromUrl(url) {
  const match = url.pathname.match(/^\/api\/score-history\/([^/]+)$/);
  return normalizeScoreHistoryGameType(match ? decodeURIComponent(match[1]) : "");
}

function scoreHistoryLimitFromUrl(url) {
  const requested = Number(url.searchParams.get("limit") || DEFAULT_SCORE_HISTORY_LIMIT);
  if (!Number.isFinite(requested)) return DEFAULT_SCORE_HISTORY_LIMIT;
  return Math.max(1, Math.min(MAX_SCORE_HISTORY_LIMIT, Math.round(requested)));
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampScoreHistoryScore(value) {
  const number = asNumber(value);
  if (number === null) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function scoreHistoryScoreForResult(gameType, result = {}) {
  if (gameType === "reaction_grid") return clampScoreHistoryScore(result.precisionScore);
  if (gameType === "cadence_keeper") return clampScoreHistoryScore(result.stabilityScore);
  if (gameType === "precision_trace") return clampScoreHistoryScore(result.traceScore);
  if (gameType === "focus_hold") return clampScoreHistoryScore(result.readScore);
  if (gameType === "pattern_scout") {
    const explicit = asNumber(result.patternScore);
    if (explicit !== null) return clampScoreHistoryScore(explicit);
    return clampScoreHistoryScore(100 - Number(result.misses || 0) * 12);
  }
  return clampScoreHistoryScore(result.score);
}

function timestampToIso(value) {
  return value?.toDate?.()?.toISOString?.() || value || null;
}

function scoreHistoryEntryFromDoc(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    gameType: data.gameType || "",
    score: clampScoreHistoryScore(data.score),
    summary: String(data.summary || "").slice(0, 180),
    stateCode: data.stateCode || "",
    stateName: data.stateName || "",
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt)
  };
}

function userScoreHistoryRuns(db, uid, gameType) {
  return db
    .collection("userGameScoreHistory")
    .doc(uid)
    .collection("games")
    .doc(gameType)
    .collection("runs");
}

async function loadScoreHistoryEntries(db, uid, gameType, limit = DEFAULT_SCORE_HISTORY_LIMIT) {
  const snapshot = await db
    .collection("userGameScoreHistory")
    .doc(uid)
    .collection("games")
    .doc(gameType)
    .collection("runs")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map(scoreHistoryEntryFromDoc);
}

async function deleteQueryDocuments(db, query, batchSize = 450) {
  let deletedCount = 0;

  for (;;) {
    const snapshot = await query.limit(batchSize).get();
    if (snapshot.empty) return deletedCount;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deletedCount += snapshot.size;
  }
}

async function deleteUserScoreHistory(db, uid) {
  let deletedRuns = 0;
  const historyRef = db.collection("userGameScoreHistory").doc(uid);

  for (const gameType of SCORE_HISTORY_GAME_TYPES) {
    const gameRef = historyRef.collection("games").doc(gameType);
    deletedRuns += await deleteQueryDocuments(db, gameRef.collection("runs"));
    await gameRef.delete();
  }

  await historyRef.delete();
  return deletedRuns;
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

function generatedGameExperienceForCard(cardOrTrait) {
  return cardOrTrait?.gameExperience || cardOrTrait?.cardStory?.gameExperience || null;
}

function plainTraitDescription(cardOrTrait) {
  const generated = generatedGameExperienceForCard(cardOrTrait);
  if (String(generated?.sharedTraitDescription || "").trim()) return String(generated.sharedTraitDescription).trim();
  const trait = cardOrTrait?.sharedTrait || cardOrTrait || {};
  return String(trait.description || "The featured sports share a similar mix of timing, control, and adaptation.").trim();
}

function connectionTraitDescription(cardOrTrait) {
  return lowerFirst(plainTraitDescription(cardOrTrait))
    .replace(/[.!?]+$/, "")
    .replace(/^celebrate the ability to\s+/i, "the ability to ")
    .replace(/^celebrate the\s+/i, "the ");
}

function plainTraitHeadline(cardOrTrait) {
  const generated = generatedGameExperienceForCard(cardOrTrait);
  const generatedName = String(generated?.sharedTraitName || "").trim();
  if (generatedName) return generatedName;
  const trait = cardOrTrait?.sharedTrait || cardOrTrait || {};
  const source = `${trait.name || ""} ${trait.description || ""}`.toLowerCase();
  const hasChangingContext = /\b(conditions?|surfaces?|transitions?|water|roads?|current|currents)\b/.test(source);
  if (/\b(focus|precision)\b/.test(source)) return "Focus and precision";
  if (/\b(elevation|mountain|terrain|weather|equipment)\b/.test(source) && /\b(pace|pacing|control|decisions?)\b/.test(source)) return "Pacing through terrain and equipment changes";
  if (/\b(pace|pacing|cadence|rhythm|timing)\b/.test(source) && hasChangingContext) return "Rhythm in changing conditions";
  if (/\b(pace|pacing|cadence|rhythm)\b/.test(source)) return "Rhythm and pacing";
  if (/\b(space|spacing|recognition)\b/.test(source)) return "Timing and space awareness";
  if (/\b(pressure|power|body control|short window|well-timed)\b/.test(source)) return "Control under pressure";
  if (/\b(signal|signals|source context)\b/.test(source)) return "Explore the available roster context";
  if (/\b(timing)\b/.test(source)) return "Clean timing";
  return plainTraitDescription(trait).replace(/[.!?]+$/, "");
}

function hasSpecificSportCue(panel) {
  return Boolean(panel?.primarySportTag || panel?.topSportTags?.[0]);
}

function featuredPanelEntries(card) {
  return [
    { program: "olympic", label: "Olympic", panel: card?.olympicPanel },
    { program: "paralympic", label: "Paralympic", panel: card?.paralympicPanel }
  ].filter((entry) => hasSpecificSportCue(entry.panel));
}

function sharedTraitConnectionSentence(card, olympicCue, paralympicCue) {
  const featuredEntries = featuredPanelEntries(card);
  if (featuredEntries.length === 1) {
    const { program, panel } = featuredEntries[0];
    const cue = displaySportName(panel.primarySportTag || panel.topSportTags?.[0] || panel.sportFamily);
    const example = traitExampleForProgram(card, program, cue);
    return `The featured sport trait is ${connectionTraitDescription(card)}. In ${cue}, that can mean ${example}.`;
  }
  if (featuredEntries.length === 0) {
    return "This selected dataset does not have a featured sport trait for this state because no sourced sport appears on the card.";
  }
  const olympicLabel = olympicCue || displaySportName(card?.olympicPanel?.primarySportTag || card?.olympicPanel?.topSportTags?.[0] || card?.olympicPanel?.sportFamily) || "the Olympic sport";
  const paralympicLabel = paralympicCue || displaySportName(card?.paralympicPanel?.primarySportTag || card?.paralympicPanel?.topSportTags?.[0] || card?.paralympicPanel?.sportFamily) || "the Paralympic sport";
  const olympicExample = traitExampleForProgram(card, "olympic", olympicLabel);
  const paralympicExample = traitExampleForProgram(card, "paralympic", paralympicLabel);
  return `The shared trait is ${connectionTraitDescription(card)}. For ${olympicLabel}, that can mean ${olympicExample}; for ${paralympicLabel}, it can mean ${paralympicExample}.`;
}

function traitExampleForProgram(card, program, visualCue) {
  const generated = card?.gameExperience || card?.cardStory?.gameExperience || {};
  const generatedExamples = generated.sharedTraitExamples || {};
  const generatedExample = generatedExamples[program] || generated[`${program}TraitExample`];
  if (String(generatedExample || "").trim()) return normalizeExamplePhrase(generatedExample);
  return sportTraitExample(visualCue, card?.[`${program}Panel`]);
}

function normalizeExamplePhrase(value) {
  return lowerFirst(value)
    .replace(/[.!?]+$/, "")
    .replace(/^(it can show up as|that can show up as|showing|through)\s+/i, "")
    .trim();
}

function sportTraitExample(visualCue, panel) {
  const sport = String(visualCue || "").toLowerCase();
  const family = String(panel?.sportFamily || "").toLowerCase();
  if (!hasSpecificSportCue(panel)) return "comparing the available sport-family context";
  if (/water polo/.test(sport)) return "reading passing lanes and resetting spacing while players tread water";
  if (/triathlon/.test(sport)) return "switching rhythm across swim, bike, run, and transition moments";
  if (/snowboard/.test(sport)) return "using edge control, line choice, and landing timing on changing snow";
  if (/alpine ski|skiing/.test(sport)) return "linking turns while managing speed, gates, and equipment";
  if (/swimming|surfing|sailing|rowing|canoe/.test(sport) || /aquatic|water/.test(family)) return "holding body position and rhythm while the water keeps changing";
  if (/track|cycling|marathon|race walk/.test(sport) || /endurance|pace/.test(family)) return "adjusting pace and cadence as the race conditions shift";
  if (/shooting|archery|fencing|golf|tennis|table tennis|badminton/.test(sport) || /precision|focus/.test(family)) return "holding focus through setup, timing, and a short decision window";
  if (/basketball|soccer|volleyball|rugby|goalball|hockey|handball|baseball|softball/.test(sport) || /team|spatial/.test(family)) return "reading space, timing passes, and resetting shape under pressure";
  if (/skateboarding|gymnastics|climbing|equestrian|breaking/.test(sport) || /balance|technical/.test(family)) return "using balance, line choice, and timing through each sequence";
  return "turning timing, movement, and decisions into something fans can watch for";
}

function panelSportList(panel) {
  const sports = panel?.allSportTags?.length ? panel.allSportTags : panel?.topSportTags;
  return (sports || []).map(displaySportName);
}

function featuredSportContexts(card) {
  return featuredPanelEntries(card).map(({ program, label, panel }) => {
    const sport = displaySportName(panel.primarySportTag || panel.topSportTags?.[0] || panel.sportFamily);
    return {
      program,
      label,
      sport,
      example: traitExampleForProgram(card, program, sport)
    };
  });
}

function gameExperienceSummary(card) {
  const generated = generatedGameExperienceForCard(card) || {};
  return {
    challengeType: generated.challengeType || card?.sharedTrait?.challengeType || "reaction_grid",
    gameName: generated.gameName || card?.cardStory?.fanChallengeName || "Fan Challenge",
    traitName: plainTraitHeadline(card),
    traitDescription: plainTraitDescription(card),
    gameIntro: generated.gameIntro || ""
  };
}

function sportConnectionForReflection(card) {
  const sports = featuredSportContexts(card);
  if (sports.length === 1) {
    return `For ${sports[0].sport}, fans can watch for ${sports[0].example}.`;
  }
  if (sports.length >= 2) {
    return `For ${sports[0].sport}, fans can watch for ${sports[0].example}; for ${sports[1].sport}, they can watch for ${sports[1].example}.`;
  }
  return `That same trait can help fans notice timing, movement, and decisions in the featured sport context.`;
}

function resultMetricValue(result, labelPattern) {
  const metric = (result?.metrics || []).find((item) => labelPattern.test(String(item?.label || "")));
  return metric ? String(metric.value || "").trim() : "";
}

function gameResultHighlights(result = {}) {
  const highlights = (result.metrics || [])
    .map((metric) => `${metric.label}: ${metric.value}`)
    .filter((value) => !/undefined|null/i.test(value));
  if (!highlights.length && result.summary) highlights.push(result.summary);
  return highlights.slice(0, 4);
}

function gameResultObservation(result = {}) {
  if (result.type === "cadence_keeper") {
    const rhythm = resultMetricValue(result, /rhythm/i) || `${result.stabilityScore || 0}%`;
    const offset = resultMetricValue(result, /offset/i) || `${result.averageErrorMs || 0}ms`;
    const bpm = resultMetricValue(result, /bpm/i) || result.bpm;
    return `Your taps held ${rhythm} sync${bpm ? ` at ${bpm} BPM` : ""}, with about ${offset} of average offset, so the rhythm read as steady but still human.`;
  }
  if (result.type === "reaction_grid") {
    const precision = resultMetricValue(result, /precision/i) || `${result.precisionScore || 0}%`;
    const targets = resultMetricValue(result, /targets/i);
    const decoys = resultMetricValue(result, /decoys/i);
    return `Your run landed at ${precision} precision${targets ? ` with ${targets} targets hit` : ""}${decoys ? ` and ${decoys} decoys avoided` : ""}.`;
  }
  if (result.type === "precision_trace") {
    const control = resultMetricValue(result, /line control/i) || `${result.traceScore || 0}%`;
    const detours = resultMetricValue(result, /detours/i) || result.detours;
    const breaks = resultMetricValue(result, /breaks/i) || result.lineBreaks;
    return `Your trace showed ${control} line control${detours !== "" ? ` with ${detours} detours` : ""}${breaks !== "" ? ` and ${breaks} line breaks` : ""}.`;
  }
  if (result.type === "focus_hold") {
    const survived = resultMetricValue(result, /survived/i);
    const lives = resultMetricValue(result, /lives/i);
    const score = resultMetricValue(result, /score/i) || `${result.readScore || 0}%`;
    return `Your movement kept enough space to score ${score}${survived ? ` after ${survived}` : ""}${lives ? ` with ${lives} lives left` : ""}.`;
  }
  if (result.type === "pattern_scout") {
    const score = resultMetricValue(result, /pattern score/i) || `${result.patternScore || 0}%`;
    const resets = resultMetricValue(result, /resets/i) || result.misses;
    const rounds = resultMetricValue(result, /rounds/i);
    return `Your memory route finished at ${score}${rounds ? ` across ${rounds} rounds` : ""}${resets !== "" ? ` with ${resets} resets` : ""}.`;
  }
  return result.summary || "Your run is saved as a personal fan-game result.";
}

function sportConnectionForGameReflection(card) {
  const sports = featuredSportContexts(card);
  if (sports.length >= 2) {
    return `In sports like ${sports[0].sport} and ${sports[1].sport}, athletes manage a real-sport version of that when they handle moments like ${sports[0].example} or ${sports[1].example}.`;
  }
  if (sports.length === 1) {
    return `In sports like ${sports[0].sport}, athletes manage a real-sport version of that when they handle moments like ${sports[0].example}.`;
  }
  return "Athletes in the featured sport context manage a sharper version of that same timing, movement, and decision-making.";
}

function panelFeaturedSportList(panel, limit = 3) {
  const sports = panel?.topSportTags?.length ? panel.topSportTags : panelSportList(panel);
  return (sports || []).slice(0, limit).map(displaySportName);
}

function datasetLabelForCard(card) {
  const scopeId = card?.dataScopeId || "both";
  if (scopeId === "paris2024") return "Olympic Games Paris 2024 and Paralympic Games Paris 2024 dataset";
  if (scopeId === "milanoCortina2026") return "Olympic Winter Games Milano Cortina 2026 and Paralympic Winter Games Milano Cortina 2026 dataset";
  if (scopeId === "both") {
    return "Olympic Games Paris 2024, Paralympic Games Paris 2024, Olympic Winter Games Milano Cortina 2026, and Paralympic Winter Games Milano Cortina 2026 dataset";
  }
  return "selected dataset";
}

function datasetLabelForSportMix(card, programLabel) {
  const scopeId = card?.dataScopeId || "both";
  const isParalympic = /^paralympic/i.test(String(programLabel || ""));
  if (scopeId === "paris2024") {
    return isParalympic
      ? "Paralympic Games Paris 2024 dataset"
      : "Olympic Games Paris 2024 dataset";
  }
  if (scopeId === "milanoCortina2026") {
    return isParalympic
      ? "Paralympic Winter Games Milano Cortina 2026 dataset"
      : "Olympic Winter Games Milano Cortina 2026 dataset";
  }
  if (scopeId === "both") {
    return isParalympic
      ? "combined Paralympic Games Paris 2024 and Paralympic Winter Games Milano Cortina 2026 dataset"
      : "combined Olympic Games Paris 2024 and Olympic Winter Games Milano Cortina 2026 dataset";
  }
  return "selected dataset";
}

function sportMixPreviewDetail(card, panel, programLabel) {
  const allSports = panelSportList(panel);
  const featuredSports = panelFeaturedSportList(panel);
  const stateName = card?.stateName || "This state";
  const datasetLabel = datasetLabelForSportMix(card, programLabel);
  if (!allSports.length) return `${panel?.sportFamily || "No sourced sport-family view"} appears in the ${datasetLabel}.`;
  if (allSports.length > featuredSports.length) {
    return `${stateName} includes ${allSports.length} ${programLabel} sports from the ${datasetLabel}. Featured examples: ${joinReadableList(featuredSports)}.`;
  }
  return `${stateName} includes ${joinReadableList(allSports)} from the ${datasetLabel}.`;
}

function safeFallbackBriefing(card, reason = "No live Gemini response was available.") {
  const olympicCue = displaySportName(card.olympicPanel.primarySportTag || card.olympicPanel.topSportTags?.[0] || card.olympicPanel.sportFamily);
  const paralympicCue = displaySportName(card.paralympicPanel.primarySportTag || card.paralympicPanel.topSportTags?.[0] || card.paralympicPanel.sportFamily);
  const featuredEntries = featuredPanelEntries(card);
  const hasSinglePanel = featuredEntries.length === 1;
  const onlyEntry = featuredEntries[0];
  const onlyCue = onlyEntry ? displaySportName(onlyEntry.panel.primarySportTag || onlyEntry.panel.topSportTags?.[0] || onlyEntry.panel.sportFamily) : "";
  const geography = card.cardStory?.geographySignal?.length
    ? joinReadableList(card.cardStory.geographySignal)
    : card.geographySnapshot;
  return {
    stateSnapshot: hasSinglePanel
      ? `In the public aggregate Team USA state data, ${card.stateName} shows a sourced ${onlyEntry.label} sport list from the ${datasetLabelForCard(card)}, with a featured card example from ${onlyCue}. That does not mean ${card.stateName} geography causes outcomes; it gives fans a safer way to explore why that sport environment appears in one state view.`
      : `In the public aggregate Team USA state data, ${card.stateName} shows Olympic and Paralympic sport lists from the ${datasetLabelForCard(card)}, with featured card examples from ${olympicCue} and ${paralympicCue}. That does not mean ${card.stateName} geography causes outcomes; it gives fans a safer way to explore why different sport environments appear in one state view.`,
    sportMix: completeSportMixItems(card),
    geographyLens: hasSinglePanel
      ? `${card.geographySnapshot} could help fans understand why this sport environment appears in this aggregate state view.`
      : `${card.geographySnapshot} could help fans understand why varied sport environments appear in this aggregate state view.`,
    hometownAreas: formatHometownAreas(card.topHometownSignals),
    whatToNotice: hasSinglePanel
      ? `The useful fan read is the featured sport's viewing pattern: notice how ${sportTraitExample(onlyCue, onlyEntry.panel)}. The card keeps the missing program side out of the featured panel instead of inventing a comparison.`
      : `The useful fan read is contrast: some sports emphasize spacing and quick decisions, while others emphasize rhythm, stillness, pacing, equipment, or transitions.`,
    surprisingConnection: hasSinglePanel
      ? `${onlyCue} can still open a broader state story; fans can watch how ${connectionTraitDescription(card)} shows up through one sourced featured sport.`
      : `${olympicCue} and ${paralympicCue} do not need to look alike to share a viewing idea; both can point fans toward control when timing, surface, or spacing changes.`,
    sharedStateSignal: sharedTraitConnectionSentence(card, olympicCue, paralympicCue),
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
  const olympicCue = displaySportName(card.olympicPanel.primarySportTag || card.olympicPanel.topSportTags?.[0] || card.olympicPanel.sportFamily);
  const paralympicCue = displaySportName(card.paralympicPanel.primarySportTag || card.paralympicPanel.topSportTags?.[0] || card.paralympicPanel.sportFamily);
  const featuredEntries = featuredPanelEntries(card);
  const generatedSignal = sharedTraitConnectionSentence(card, olympicCue, paralympicCue);
  return {
    ...briefing,
    sportMix: completeItems,
    sharedStateSignal: featuredEntries.length === 1
      ? generatedSignal
      : String(briefing?.sharedStateSignal || "").trim() || generatedSignal
  };
}

function formatHometownAreas(signals = []) {
  return (signals || []).slice(0, 3).map((area) => ({
    area: area.label,
    detail: `${area.total} public Team USA athlete records list ${area.label} as their hometown (${area.olympic} Olympic-side, ${area.paralympic} Paralympic-side).`
  }));
}

function safeFallbackGameReflection(card, result, reason = "No live Gemini response was available.") {
  const game = gameExperienceSummary(card);
  const detail = gameResultObservation(result).replace(/[.!?]+$/, "");
  const sportConnection = sportConnectionForGameReflection(card);
  return {
    reflection: `${detail}, which connects in ${card.stateName}'s ${game.gameName} to ${connectionTraitDescription(card)}. ${sportConnection}`,
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

  const shorthandGamesText = text
    .replace(/\bOlympic Games Paris 2024\b/gi, "")
    .replace(/\bParalympic Games Paris 2024\b/gi, "")
    .replace(/\bOlympic Winter Games Milano Cortina 2026\b/gi, "")
    .replace(/\bParalympic Winter Games Milano Cortina 2026\b/gi, "");
  if (/\bParis\s*2024\b/i.test(shorthandGamesText)) {
    warnings.push("Use approved full Games reference instead of Paris 2024 shorthand.");
  }
  if (/\bMilano\s+Cortina\s*2026\b/i.test(shorthandGamesText)) {
    warnings.push("Use approved full Games reference instead of Milano Cortina 2026 shorthand.");
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
  const availablePrograms = featuredPanelEntries(card);
  for (const entry of availablePrograms) {
    const hasProgramContext = new RegExp(entry.label, "i").test(sportMixText)
      || textIncludesAnySport(sportMixText, sportNamesForProgram(card, entry.program));
    if (!hasProgramContext) {
      warnings.push(`Sport Mix must include ${entry.label} context.`);
    }
  }

  const sharedStateSignalText = String(briefing.sharedStateSignal || "");
  if (availablePrograms.length === 1 && /\b(shared trait|both featured|two featured|Olympic and Paralympic)\b/i.test(sharedStateSignalText)) {
    warnings.push("SharedStateSignal must describe the trait of the single featured sport, not a shared two-sport trait.");
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
  const featuredEntries = featuredPanelEntries(card);
  const hasSinglePanel = featuredEntries.length === 1;
  const onlyEntry = featuredEntries[0];
  const featuredPanelGuidance = hasSinglePanel
    ? `Only the ${onlyEntry.label} side has sourced sports in this selected data view. The featured card panel deep-dives on that one selected sport. Do not invent, compare against, or include a missing ${onlyEntry.program === "olympic" ? "Paralympic" : "Olympic"} featured sport.`
    : "The featured card panels already deep-dive on two selected sports. The Gemini State Briefing is the wider state story layer: state snapshot, broader sport mix grouped by theme, geography lens, what to notice, a surprising connection, and one shared card thread.";
  const sportMixGuidance = hasSinglePanel
    ? `sportMix: array of 1 object only: one "${onlyEntry.label} sports" object. Do not add a no-sourced or placeholder object for the missing program side.`
    : 'sportMix: array of 2 objects only: one "Olympic sports" object and one "Paralympic sports" object.';
  const sharedSignalGuidance = hasSinglePanel
    ? `sharedStateSignal: 1 plain-English sentence explaining the trait of the featured ${onlyEntry.label} sport, with one short concrete example from that sport. Use readable wording similar to: "The featured sport trait is [plain trait]. In [featured sport], that can mean [example]." Do not use the phrase "shared trait" for this one-sport card.`
    : `sharedStateSignal: 1 plain-English sentence explaining the shared trait between the two featured sports, with one short concrete example from each featured sport. Use readable wording similar to: "The shared trait is [plain trait]. For [Olympic featured sport], that can mean [example]; for [Paralympic featured sport], it can mean [example]."`;
  const programDepthGuidance = hasSinglePanel
    ? `Cover only the ${onlyEntry.label} sport mix with sourced sport context. Keep the missing program side out of the copy unless you are briefly explaining that this selected data view has no featured sport on that side.`
    : "Give Olympic and Paralympic sport mixes equal depth, equal respect, and equal analytical specificity.";
  const surprisingConnectionGuidance = hasSinglePanel
    ? "surprisingConnection: 1-2 sentences. Choose a surprising observation within the sourced sport list or featured sport family. Do not create a two-program comparison."
    : "surprisingConnection: 1-2 sentences. Choose one surprising connection across the broader state sport mix. Prefer one Olympic-side sport and one Paralympic-side sport, but do not force the featured card pair if another connection is more interesting.";
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
${featuredPanelGuidance}
Use allSportTags as the complete selected-data-view sport list, but do not enumerate the full list in paragraph copy. The application renders that full list behind a See all control. Treat topSportTags, primarySportTag, and cardStory featured sports as featured card lenses for concise examples. Do not use the phrase "sport tags" in the output.
${programDepthGuidance}
If olympicPanel.cardBackCopy or paralympicPanel.cardBackCopy are present, use that Gemini card-back copy as supporting context, but do not simply repeat it.
Do not expose internal implementation terms such as "row", "pipeline", "fallback", "template", "card image cue", "featured cue", "card lens", "sport tag", "sport tags", "raw data", "signal", "participation signal", "aggregate presence", or "athletic landscape".
When referencing the source dataset, use the approved Games terminology from dataViewLabel. Never use shorthand such as "Paris 2024 dataset" or "Milano Cortina 2026 dataset."
Do not use these weak or internal-sounding words and phrases: "backdrop", "frame", "framing", "could help fans discover", "state signal", "high signal", "medium signal", "low signal".
Avoid overstatement words such as "strong", "dominant", "best", or "proves".
Do not use athlete names, finish times, scores, rankings, medals, or claims that geography causes success.
Do not write bland compliance paragraphs. Use concrete sport context, readable observations, and a few fun fan hooks.
Output concise, scannable, fan-facing copy. Add new insight about the whole state; do not restate the sport-panel copy.
Do not imply these sports are all trained in the state or caused by state geography. Use phrases such as "appears in the public aggregate state data", "state view", "could help fans explore", and "may suggest a fan-discovery lens."

Return valid JSON with these fields:
- stateSnapshot: 2-3 sentences starting with "In the public aggregate Team USA state data..." or similar safe wording. It should explain the broad state view without implying geography causes outcomes.
- ${sportMixGuidance} Keep this section as a concise inventory of the selected sport lists and featured examples. Do not add thematic interpretation rows here; put broader sport-pattern insight in whatToNotice or surprisingConnection.
- hometownAreas: array of up to 3 objects. If topHometownSignals are provided, each object has:
  - area: the city/area label from the provided data.
  - detail: 1 sentence with its provided total public Team USA athlete records listing that area as hometown plus Olympic-side and Paralympic-side entries. Say "records", not "athletes", and do not imply this is a complete athlete census.
- geographyLens: 1-2 sentences connecting geography/climate/terrain to fan context with conditional language.
- whatToNotice: 2-3 sentences with concrete fan viewing observations across the broader sport mix.
- ${surprisingConnectionGuidance}
- ${sharedSignalGuidance} Do not use coined trait names, the phrase "state signal", or performance-outcome claims.
- gameIntro: 1 sentence safe challenge intro for the challenge screen.
- complianceWarnings

Style target:
State Snapshot should feel like "In the public aggregate state data, California shows..." and should not sound guaranteed.
Sport Mix should be short and inventory-like, not interpretive. Do not repeat sport themes that are already covered in What To Notice or Surprising Connection.
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
  dataViewLabel: datasetLabelForCard(card),
  olympicDataViewLabel: datasetLabelForSportMix(card, "Olympic"),
  paralympicDataViewLabel: datasetLabelForSportMix(card, "Paralympic"),
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
  }
}, null, 2)}`;
}

function buildBriefingRepairPrompt(card, briefing, validationWarnings) {
  const featuredEntries = featuredPanelEntries(card);
  const hasSinglePanel = featuredEntries.length === 1;
  const onlyEntry = featuredEntries[0];
  const sharedSignalRepairGuidance = hasSinglePanel
    ? `Keep sharedStateSignal as one readable featured-sport-trait sentence with one short concrete example from ${onlyEntry.label} sport context. Do not use "shared trait" or compare to a missing program side.`
    : "Keep sharedStateSignal as one readable shared-trait sentence with one short concrete example from each featured sport.";
  const sportMixRepairGuidance = hasSinglePanel
    ? `sportMix: array of 1 object with theme and detail: "${onlyEntry.label} sports" only. Do not include a missing-program placeholder.`
    : 'sportMix: array of 2 objects with theme and detail: "Olympic sports" and "Paralympic sports" only';
  return `Rewrite this Gemini State Briefing JSON so it passes the local compliance validator.

Keep the same JSON schema and the same state/sport meaning.
Use only the provided aggregate state data and the rejected briefing as context.
Do not mention individual athlete names, athlete likeness, finish times, scores, rankings, medals, exact state/program totals, or performance predictions.
Exact counts are allowed only inside hometownAreas when copied from provided topHometownSignals, and must be called public hometown entries.
Do not imply geography causes athletic outcomes.
Use conditional wording such as "may suggest", "could help fans understand", "appears in the state view", and "could show how".
Remove every word or phrase flagged by the validator. In particular, do not use any form of "guarantee", "frame", "framing", "backdrop", "signal", "row", "roster data", "athletic landscape", "dominant", "best", or "strong".
Use approved Games terminology for source datasets, such as "Olympic Games Paris 2024" or "Paralympic Winter Games Milano Cortina 2026." Never use shorthand such as "Paris 2024 dataset" or "Milano Cortina 2026 dataset."
Use "does not imply performance outcomes" instead of any sentence containing the word "guarantee".
Use "could help fans understand" or "could show how" instead of "frame", "framing", or "backdrop".
${sharedSignalRepairGuidance}
For complianceWarnings, return an empty array unless there is a real unresolved issue.

Return valid JSON with these exact fields:
- stateSnapshot
- ${sportMixRepairGuidance}
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
  dataViewLabel: datasetLabelForCard(card),
  olympicDataViewLabel: datasetLabelForSportMix(card, "Olympic"),
  paralympicDataViewLabel: datasetLabelForSportMix(card, "Paralympic"),
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
  const game = gameExperienceSummary(card);
  const featuredSports = featuredSportContexts(card);
  const resultObservation = gameResultObservation(result);
  const metricHighlights = gameResultHighlights(result);
  return `You are writing a safe fan-game reflection for a Team USA x Google Cloud Hackathon project.

Write a concise post-game reflection that does three things:
1. Acknowledge the user's personal mini-game result using one concrete number from the result.
2. Connect that result to the state card's sport trait in plain language.
3. Relate the trait to what athletes manage in the featured sport context, without comparing the user to athletes.

Use only the provided state, game, sport connection, featured sport, and personal game result data.
Do not use coined trait names such as "Waterline Control"; explain the connection in plain language.
Do not say the user performed like an athlete. Do not compare the user to athletes, Olympians, Paralympians, medalists, teams, training baselines, finish times, or competition scores.
Do not call this a diagnostic, assessment, talent test, or athletic test.
Use conditional fan-appreciation language.
Mention ${card.stateName} naturally once.
If one featured sport is provided, phrase it as "sports like [sport]" rather than making the trait sound exclusive to that sport.
If two featured sports are provided, mention both sport names briefly.
Use the word "athletes" once in the sport-connection sentence, but do not compare the user to athletes.
Keep the reflection to 2 short sentences, maximum 45 words total.
Do not repeat the exact personal result sentence verbatim.
Avoid generic phrases like "This ability is helpful for athletes", "This consistency helps", or "throughout the challenge."
Return valid JSON with fields:
- reflection
- warnings

State and game context:
${JSON.stringify({
  stateName: card.stateName,
  gameName: game.gameName,
  challengeType: game.challengeType,
  traitName: game.traitName,
  traitDescription: game.traitDescription,
  gameIntro: game.gameIntro,
  featuredSports,
  resultObservation,
  metricHighlights
}, null, 2)}

Personal game result:
${JSON.stringify(result, null, 2)}`;
}

async function callGemini(prompt, model = GEMINI_MODEL) {
  if (GOOGLE_CLOUD_PROJECT) return callVertexGemini(prompt, model);

  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return null;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
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
  return { text, model };
}

function vertexEndpoint(model = GEMINI_MODEL) {
  const host = GOOGLE_CLOUD_LOCATION === "global"
    ? "https://aiplatform.googleapis.com"
    : `https://${GOOGLE_CLOUD_LOCATION}-aiplatform.googleapis.com`;
  return `${host}/v1/projects/${encodeURIComponent(GOOGLE_CLOUD_PROJECT)}/locations/${encodeURIComponent(GOOGLE_CLOUD_LOCATION)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
}

async function getVertexAccessToken({ forceRefresh = false } = {}) {
  if (!forceRefresh && process.env.VERTEX_ACCESS_TOKEN) return process.env.VERTEX_ACCESS_TOKEN;
  if (!forceRefresh && process.env.GOOGLE_OAUTH_ACCESS_TOKEN) return process.env.GOOGLE_OAUTH_ACCESS_TOKEN;

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

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function vertexHttpError(status, errorText, attempt) {
  const error = new Error(`Vertex Gemini request failed: ${status} ${errorText}`);
  error.status = status;
  error.vertexAttempts = attempt;
  return error;
}

function withVertexAttempts(error, attempt) {
  const normalized = error instanceof Error ? error : new Error(String(error));
  normalized.vertexAttempts = attempt;
  return normalized;
}

function isRetryableVertexError(status, errorText = "") {
  return [408, 409, 429, 500, 502, 503, 504].includes(status)
    || /\b(resource_exhausted|exhausted|temporar(?:y|ily)|unavailable|deadline|timeout)\b/i.test(errorText);
}

function retryAfterHeaderMs(response) {
  const value = response?.headers?.get?.("retry-after");
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : 0;
}

function vertexRetryDelayMs(response, attempt) {
  const retryAfter = retryAfterHeaderMs(response);
  if (retryAfter) return retryAfter;
  const baseDelay = response?.status === 429 ? VERTEX_RATE_LIMIT_RETRY_DELAY_MS : VERTEX_RETRY_DELAY_MS;
  return baseDelay * attempt;
}

async function callVertexGemini(prompt, model = GEMINI_MODEL) {
  let token = await getVertexAccessToken();
  let lastError = null;

  for (let attempt = 1; attempt <= VERTEX_REQUEST_MAX_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetch(vertexEndpoint(model), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        signal: AbortSignal.timeout(VERTEX_REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          contents: [{ role: "USER", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.35
          }
        })
      });
    } catch (error) {
      lastError = withVertexAttempts(error, attempt);
      if (attempt >= VERTEX_REQUEST_MAX_ATTEMPTS) throw lastError;
      await sleep(vertexRetryDelayMs(null, attempt));
      continue;
    }

    if (response.ok) {
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
      return { text, model: `${model} via Vertex AI`, vertexAttempts: attempt };
    }

    const errorText = await response.text();
    lastError = vertexHttpError(response.status, errorText, attempt);
    const shouldRefreshToken = response.status === 401;
    const shouldRetry = attempt < VERTEX_REQUEST_MAX_ATTEMPTS && (
      shouldRefreshToken || isRetryableVertexError(response.status, errorText)
    );
    if (!shouldRetry) throw lastError;

    if (shouldRefreshToken) {
      try {
        token = await getVertexAccessToken({ forceRefresh: true });
      } catch {
        throw lastError;
      }
    }
    await sleep(vertexRetryDelayMs(response, attempt));
  }

  throw lastError || new Error("Vertex Gemini request failed before a response was available.");
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

  const scoreHistoryGameType = scoreHistoryGameTypeFromUrl(url);
  if (scoreHistoryGameType && (req.method === "GET" || req.method === "POST")) {
    let user;
    try {
      user = await currentAuthUser(req);
    } catch (error) {
      clearSessionCookie(res);
      sendJson(res, 401, { error: `Session is not valid: ${error.message}` });
      return true;
    }

    if (!user) {
      sendJson(res, 401, {
        error: req.method === "GET"
          ? "Log in to view your previous scores."
          : "Log in to save your score."
      });
      return true;
    }

    if (req.method === "GET") {
      try {
        const { db } = await getFirebaseAdmin();
        const entries = await loadScoreHistoryEntries(db, user.uid, scoreHistoryGameType, scoreHistoryLimitFromUrl(url));
        sendJson(res, 200, { gameType: scoreHistoryGameType, entries });
      } catch (error) {
        sendJson(res, 500, { error: `Could not load score history: ${error.message}` });
      }
      return true;
    }

    try {
      const body = await readBody(req);
      const payload = body ? JSON.parse(body) : {};
      const result = payload.result || {};
      const score = scoreHistoryScoreForResult(scoreHistoryGameType, result);
      const stateCode = String(payload.stateCode || "").toUpperCase().slice(0, 4);
      const stateName = String(payload.stateName || "").trim().slice(0, 80);
      const { db, FieldValue } = await getFirebaseAdmin();
      const entryRef = await userScoreHistoryRuns(db, user.uid, scoreHistoryGameType).add({
        gameType: scoreHistoryGameType,
        score,
        summary: String(result.summary || "").slice(0, 180),
        stateCode,
        stateName,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      const nextSnapshot = await entryRef.get();
      const entry = scoreHistoryEntryFromDoc(nextSnapshot);
      const entries = await loadScoreHistoryEntries(db, user.uid, scoreHistoryGameType, scoreHistoryLimitFromUrl(url));

      sendJson(res, 200, {
        gameType: scoreHistoryGameType,
        saved: true,
        currentRunScore: score,
        entry,
        entries
      });
    } catch (error) {
      sendJson(res, 500, { error: `Could not save score history: ${error.message}` });
    }
    return true;
  }

  if (url.pathname.startsWith("/api/score-history/")) {
    sendJson(res, 400, { error: "Unsupported score history game type." });
    return true;
  }

  if (url.pathname.startsWith("/api/leaderboards/")) {
    sendJson(res, 410, { error: "Public leaderboards have been replaced by private score history." });
    return true;
  }

  if (url.pathname === "/api/user/progress" && req.method === "DELETE") {
    let user;
    try {
      user = await currentAuthUser(req);
    } catch (error) {
      clearSessionCookie(res);
      sendJson(res, 401, { error: `Session is not valid: ${error.message}` });
      return true;
    }

    if (!user) {
      sendJson(res, 401, { error: "Log in to reset your progress." });
      return true;
    }

    try {
      const { db, FieldValue } = await getFirebaseAdmin();
      const deletedScoreRuns = await deleteUserScoreHistory(db, user.uid);
      await db.collection("userCollections").doc(user.uid).set({
        discoveredCodes: [],
        playedCodes: [],
        uid: user.uid,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });

      sendJson(res, 200, {
        ok: true,
        discoveredCodes: [],
        playedCodes: [],
        deletedScoreRuns
      });
    } catch (error) {
      sendJson(res, 500, { error: `Could not reset progress: ${error.message}` });
    }
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
    const discoveredCodes = normalizeCodeList(
      Array.isArray(payload.discoveredCodes) ? payload.discoveredCodes : ["CO"],
      dataset
    );
    const playedCodes = normalizeCodeList(payload.playedCodes || [], dataset);

    await collectionRef.set({
      discoveredCodes,
      playedCodes,
      uid: user.uid,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    sendJson(res, 200, {
      discoveredCodes,
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
      let validationWarnings = complianceCheckBriefing(briefing, card);
      if (validationWarnings.length > 0) {
        let rejectedBriefing = briefing;
        let repairAttempts = 0;

        while (repairAttempts < BRIEFING_REPAIR_ATTEMPTS && validationWarnings.length > 0) {
          repairAttempts += 1;
          let repairedGemini = null;
          try {
            repairedGemini = await callGemini(buildBriefingRepairPrompt(card, rejectedBriefing, validationWarnings));
          } catch {
            break;
          }

          if (repairedGemini) {
            try {
              rejectedBriefing = briefingWithCompleteSportMix(JSON.parse(normalizeJsonText(repairedGemini.text)), card);
              validationWarnings = complianceCheckBriefing(rejectedBriefing, card);
            } catch {
              break;
            }

            if (validationWarnings.length === 0) {
              sendJson(res, 200, {
                source: "gemini-rewrite",
                model: repairedGemini.model,
                briefing: rejectedBriefing,
                complianceWarnings: rejectedBriefing.complianceWarnings || [],
                vertexAttempts: gemini.vertexAttempts,
                repairVertexAttempts: repairedGemini.vertexAttempts,
                repairAttempts
              });
              return true;
            }
          } else {
            break;
          }
        }

        sendJson(res, 200, {
          source: "fallback-after-validation",
          model: gemini.model,
          briefing: safeFallbackBriefing(card, "Gemini output was replaced after local compliance validation."),
          complianceWarnings: validationWarnings,
          vertexAttempts: gemini.vertexAttempts,
          repairAttempts
        });
        return true;
      }

      sendJson(res, 200, {
        source: "gemini",
        model: gemini.model,
        briefing,
        complianceWarnings: briefing.complianceWarnings || [],
        vertexAttempts: gemini.vertexAttempts
      });
    } catch (error) {
      sendJson(res, 200, {
        source: "fallback-after-error",
        model: GEMINI_MODEL,
        briefing: safeFallbackBriefing(card, error.message),
        complianceWarnings: [error.message],
        vertexAttempts: error.vertexAttempts
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
      const gemini = await callGemini(buildGamePrompt(card, result), GAME_REFLECTION_MODEL);
      if (!gemini) {
        sendJson(res, 200, safeFallbackGameReflection(card, result, "Set GEMINI_API_KEY or GOOGLE_API_KEY to enable live Gemini generation."));
        return true;
      }

      const parsed = JSON.parse(normalizeJsonText(gemini.text));
      const text = String(parsed.reflection || "");
      const unsafe = /\b(compare|diagnostic|assessment|athletic test|train like|baseline|medal|elite)\b/i.test(text);
      const missingState = card.stateName && !text.toLowerCase().includes(card.stateName.toLowerCase());
      const missingMetric = !/\d/.test(text);
      const missingAthleteConnection = !/\bathletes?\b/i.test(text);
      const tooGeneric = /\bthis (ability|consistency|skill) (is )?helpful\b|\bthis consistency helps\b|\bhelps athletes\b|\bduring (?!sports like\b)/i.test(text)
        || /\bthroughout the\b.*\bchallenge\b/i.test(text);
      if (unsafe || missingState || missingMetric || missingAthleteConnection || tooGeneric) {
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
