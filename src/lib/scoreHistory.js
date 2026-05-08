const SCORE_HISTORY_LIMIT = 50;

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampScore(value) {
  const number = asNumber(value);
  if (number === null) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

export function scoreForResult(result = {}, fallbackGameType = "") {
  const gameType = result.type || fallbackGameType;
  if (gameType === "reaction_grid") return clampScore(result.precisionScore);
  if (gameType === "cadence_keeper") return clampScore(result.stabilityScore);
  if (gameType === "precision_trace") return clampScore(result.traceScore);
  if (gameType === "focus_hold") return clampScore(result.readScore);
  if (gameType === "pattern_scout") {
    const explicit = asNumber(result.patternScore);
    if (explicit !== null) return clampScore(explicit);
    return clampScore(100 - Number(result.misses || 0) * 12);
  }
  return clampScore(result.score);
}

async function parseJsonResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

export async function loadScoreHistory(gameType) {
  const response = await fetch(`/api/score-history/${encodeURIComponent(gameType)}?limit=${SCORE_HISTORY_LIMIT}`, {
    headers: { Accept: "application/json" }
  });
  return parseJsonResponse(response);
}

export async function saveScoreHistoryRun({ gameType, result, card }) {
  const response = await fetch(`/api/score-history/${encodeURIComponent(gameType)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      result,
      stateCode: card?.stateCode,
      stateName: card?.stateName
    })
  });
  return parseJsonResponse(response);
}

export function makeLocalScoreHistoryRun({ result, card, gameType, isUnsaved = false }) {
  return {
    id: isUnsaved ? "guest-current-run" : "current-run",
    gameType,
    score: scoreForResult(result, gameType),
    summary: result?.summary || "",
    stateCode: card?.stateCode || "",
    stateName: card?.stateName || "",
    createdAt: new Date().toISOString(),
    isUnsaved
  };
}
