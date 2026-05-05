import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

const OLYMPIC_TAG = "Olympic Games Paris 2024, Qualified";
const PARALYMPIC_TAG = "Paralympic Games Paris 2024, Qualified";
const HOMETOWN_SIGNAL_LIMIT = 3;
const HOMETOWN_SIGNAL_MINIMUM = 3;
const DEBUG_HOMETOWN = process.argv.includes("--debug-hometown");

const outputPath = path.resolve(appRoot, "public/data/state-cards.json");

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const dataset = JSON.parse(await readFile(outputPath, "utf8"));
  const states = Object.fromEntries((dataset.states || []).map((card) => [card.stateCode, new Map()]));

  const olympicData = await fetchRoster(OLYMPIC_TAG, 700);
  const paralympicData = await fetchRoster(PARALYMPIC_TAG, 500);

  if (DEBUG_HOMETOWN) {
    console.log(JSON.stringify({
      olympicKeys: Object.keys(olympicData || {}),
      paralympicKeys: Object.keys(paralympicData || {}),
      olympicLength: olympicData?.entries?.length || 0,
      paralympicLength: paralympicData?.entries?.length || 0,
      olympicPreview: Object.fromEntries(Object.entries(olympicData || {}).filter(([, value]) => !Array.isArray(value)).slice(0, 8))
    }, null, 2));
    const samples = [...(olympicData?.entries || []), ...(paralympicData?.entries || [])]
      .slice(0, 4)
      .map((athlete) => ({
        topLevelKeys: Object.keys(athlete || {}),
        bioKeys: Object.keys(athlete?.bio || {}),
        quickFactKeys: Object.keys(athlete?.bio?.quick_facts || {}),
        hometown: athlete?.bio?.quick_facts?.hometown || null,
        hometownAlt: athlete?.hometown || athlete?.homeTown || athlete?.birthplace || null
      }));
    console.log(JSON.stringify(samples, null, 2));
    return;
  }

  ingestEntries(states, olympicData?.entries || [], "olympic");
  ingestEntries(states, paralympicData?.entries || [], "paralympic");

  dataset.states = dataset.states.map((card) => ({
    ...card,
    topHometownSignals: buildTopHometownSignals(states[card.stateCode])
  }));

  dataset.meta = {
    ...dataset.meta,
    hometownAreaPolicy: `Top hometown areas are city-level aggregate public source entries only, require at least ${HOMETOWN_SIGNAL_MINIMUM} public source records, and do not expose athlete names, profiles, images, or individual records.`
  };

  await writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`);
  console.log(`Updated ${outputPath} with top city-level hometown signals.`);
}

async function fetchRoster(contentTags, limit) {
  const params = new URLSearchParams({
    order: "asc",
    limit: String(limit),
    offset: "0",
    contentTags,
    matchAllTags: "false"
  });
  const response = await fetch(`https://www.teamusa.com/api/athletes?${params}`, {
    headers: { "User-Agent": "Common Ground public-data prototype" }
  });
  if (!response.ok) throw new Error(`Team USA API request failed for ${contentTags}: ${response.status}`);
  return response.json();
}

function ingestEntries(states, entries, program) {
  for (const athlete of entries) {
    const stateCode = normalizeStateCode(athlete?.bio?.quick_facts?.hometown?.state);
    const city = normalizeCityName(athlete?.bio?.quick_facts?.hometown?.city);
    if (!stateCode || !city || !states[stateCode]) continue;

    const cityMap = states[stateCode];
    const current = cityMap.get(city) || { city, olympic: 0, paralympic: 0, total: 0 };
    current[program] += 1;
    current.total += 1;
    cityMap.set(city, current);
  }
}

function buildTopHometownSignals(cityMap = new Map()) {
  return [...cityMap.values()]
    .filter((area) => area.total >= HOMETOWN_SIGNAL_MINIMUM)
    .sort((a, b) => b.total - a.total || b.olympic - a.olympic || a.city.localeCompare(b.city))
    .slice(0, HOMETOWN_SIGNAL_LIMIT)
    .map((area, index) => ({
      rank: index + 1,
      areaType: "city",
      label: area.city,
      total: area.total,
      olympic: area.olympic,
      paralympic: area.paralympic,
      countLabel: "public hometown entries"
    }));
}

function normalizeStateCode(value) {
  if (!value || typeof value !== "string") return "";
  return value.trim().toUpperCase();
}

function normalizeCityName(value) {
  if (!value || typeof value !== "string") return "";
  return titleCase(value.replace(/\s+/g, " ").trim());
}

function titleCase(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}
