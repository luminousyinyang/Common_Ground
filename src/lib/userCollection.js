async function parseJsonResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

export async function loadUserCollection() {
  const response = await fetch("/api/user/collection", {
    headers: { Accept: "application/json" }
  });
  return parseJsonResponse(response);
}

export async function saveUserCollection({ discoveredCodes, playedCodes }) {
  const response = await fetch("/api/user/collection", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      discoveredCodes: [...discoveredCodes],
      playedCodes: [...playedCodes]
    })
  });
  return parseJsonResponse(response);
}

export async function resetUserProgress() {
  const response = await fetch("/api/user/progress", {
    method: "DELETE",
    headers: { Accept: "application/json" }
  });
  return parseJsonResponse(response);
}
