import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

const SOURCE_URLS = {
  paris2024Olympic: "https://www.teamusa.com/paris-2024/olympics/roster",
  paris2024Paralympic: "https://www.teamusa.com/paris-2024/paralympics/roster",
  milanoCortina2026Olympic: "https://www.teamusa.com/milano-cortina-2026/olympics/roster",
  milanoCortina2026Paralympic: "https://www.teamusa.com/milano-cortina-2026/paralympics/roster",
  usAtlas: "https://github.com/topojson/us-atlas",
  noaa: "https://www.noaa.gov/climate"
};

const ROSTER_SOURCES = [
  {
    id: "paris2024Olympic",
    gamesScope: "paris2024",
    gamesLabel: "Paris 2024",
    program: "olympic",
    label: "TeamUSA.com Paris 2024 Olympic roster",
    url: SOURCE_URLS.paris2024Olympic,
    contentTag: "Olympic Games Paris 2024, Qualified",
    limit: 700
  },
  {
    id: "paris2024Paralympic",
    gamesScope: "paris2024",
    gamesLabel: "Paris 2024",
    program: "paralympic",
    label: "TeamUSA.com Paris 2024 Paralympic roster",
    url: SOURCE_URLS.paris2024Paralympic,
    contentTag: "Paralympic Games Paris 2024, Qualified",
    limit: 400
  },
  {
    id: "milanoCortina2026Olympic",
    gamesScope: "milanoCortina2026",
    gamesLabel: "Milano Cortina 2026",
    program: "olympic",
    label: "TeamUSA.com Milano Cortina 2026 Olympic roster",
    url: SOURCE_URLS.milanoCortina2026Olympic,
    contentTag: "Olympic Winter Games Milano Cortina 2026, Qualified",
    limit: 300
  },
  {
    id: "milanoCortina2026Paralympic",
    gamesScope: "milanoCortina2026",
    gamesLabel: "Milano Cortina 2026",
    program: "paralympic",
    label: "TeamUSA.com Milano Cortina 2026 Paralympic roster",
    url: SOURCE_URLS.milanoCortina2026Paralympic,
    contentTag: "Paralympic Winter Games Milano Cortina 2026, Qualified",
    limit: 150
  }
];

const DATA_SCOPES = [
  {
    id: "both",
    label: "Paris 2024 + Milano Cortina 2026",
    shortLabel: "Both",
    description: "Olympic Games Paris 2024, Paralympic Games Paris 2024, Olympic Winter Games Milano Cortina 2026, and Paralympic Winter Games Milano Cortina 2026 public rosters.",
    rosterSourceIds: ROSTER_SOURCES.map((source) => source.id)
  },
  {
    id: "paris2024",
    label: "Paris 2024",
    shortLabel: "Paris 2024",
    description: "Olympic Games Paris 2024 and Paralympic Games Paris 2024 public rosters.",
    rosterSourceIds: ROSTER_SOURCES.filter((source) => source.gamesScope === "paris2024").map((source) => source.id)
  },
  {
    id: "milanoCortina2026",
    label: "Milano Cortina 2026",
    shortLabel: "Milano Cortina 2026",
    description: "Olympic Winter Games Milano Cortina 2026 and Paralympic Winter Games Milano Cortina 2026 public rosters.",
    rosterSourceIds: ROSTER_SOURCES.filter((source) => source.gamesScope === "milanoCortina2026").map((source) => source.id)
  }
];

const STATE_CONTEXT = {
  AL: ["Alabama", "Gulf Coast, river valleys, humid subtropical climate, mixed urban and rural sport access", "Humid subtropical climate with Gulf Coast and inland river context", ["Gulf Coast", "river valleys", "humid climate"]],
  AK: ["Alaska", "Arctic and subarctic terrain, long winters, mountain ranges, coastal access", "Cold-climate context with mountain, coastal, and winter-environment signals", ["cold climate", "mountains", "coastal access"]],
  AZ: ["Arizona", "Desert basins, high plateau, mountain ranges, dry heat, year-round outdoor access", "Desert and high-plateau climate context with heat-adaptation and outdoor-access signals", ["desert", "high plateau", "dry heat"]],
  AR: ["Arkansas", "Ozark and Ouachita terrain, river valleys, humid climate, mixed outdoor access", "Humid inland climate with hill, forest, and river-valley context", ["hill terrain", "river valleys", "forest access"]],
  CA: ["California", "Pacific coast, mountains, desert, large urban regions, year-round outdoor access", "Mixed coastal and inland climates with broad multi-sport context", ["coast", "mountains", "desert", "urban access"]],
  CO: ["Colorado", "High elevation, mountain terrain, seasonal snow, outdoor access", "Mountain climate with elevation, endurance, and winter-environment context", ["higher elevation", "mountain terrain", "seasonal snow"]],
  CT: ["Connecticut", "Northeast coast, river valleys, dense town networks, seasonal climate", "Four-season coastal and river-valley context with compact access patterns", ["coast", "river valleys", "four-season climate"]],
  DE: ["Delaware", "Atlantic coastal plain, bays, low elevation, humid seasonal climate", "Coastal plain climate context with bay and shoreline access signals", ["coastal plain", "bays", "low elevation"]],
  FL: ["Florida", "Peninsula coastline, humid subtropical climate, flat terrain, year-round water access", "Warm coastal climate with aquatic, sprint, and year-round outdoor context", ["coastline", "humid heat", "flat terrain"]],
  GA: ["Georgia", "Coastal plain, Piedmont, Appalachian foothills, humid subtropical climate", "Humid climate with inland, foothill, and coastal context", ["Piedmont", "foothills", "humid climate"]],
  HI: ["Hawaii", "Pacific islands, volcanic terrain, ocean exposure, tropical climate", "Tropical ocean climate with coastal and water-environment context", ["islands", "ocean access", "volcanic terrain"]],
  ID: ["Idaho", "Mountain ranges, high desert, rivers, snow-season access, inland outdoor terrain", "Mountain and high-desert context with river and winter-season signals", ["mountains", "high desert", "river corridors"]],
  IL: ["Illinois", "Great Lakes access, prairie, large urban region, continental climate", "Midwest continental climate with urban, lakefront, and plains context", ["Great Lakes", "prairie", "urban access"]],
  IN: ["Indiana", "Midwest plains, river corridors, humid continental climate, broad town networks", "Continental climate with plains and river-valley context", ["plains", "river corridors", "seasonal climate"]],
  IA: ["Iowa", "Rolling plains, river borders, agricultural landscape, humid continental climate", "Continental climate with open-plains and river-border context", ["rolling plains", "river borders", "seasonal climate"]],
  KS: ["Kansas", "Great Plains, open terrain, wind exposure, continental climate", "Plains climate context with open terrain and wind-exposure signals", ["Great Plains", "open terrain", "wind exposure"]],
  KY: ["Kentucky", "Appalachian foothills, Bluegrass region, river corridors, humid climate", "Humid inland climate with foothill, rolling-terrain, and river context", ["foothills", "rolling terrain", "river corridors"]],
  LA: ["Louisiana", "Gulf Coast, Mississippi Delta, wetlands, humid subtropical climate", "Warm coastal and delta climate with wetland and river-system context", ["Gulf Coast", "delta", "wetlands"]],
  ME: ["Maine", "North Atlantic coast, forests, colder winters, lakes, mountain terrain", "Northern coastal climate with forest, lake, and winter-environment context", ["Atlantic coast", "forests", "cold winters"]],
  MD: ["Maryland", "Chesapeake Bay, coastal plain, Piedmont, dense urban corridors", "Mid-Atlantic climate with bay, coastal-plain, and urban-corridor context", ["Chesapeake Bay", "coastal plain", "urban corridor"]],
  MA: ["Massachusetts", "Atlantic coast, dense urban region, hills, four-season climate", "Northeast coastal climate with urban, academic, and seasonal context", ["Atlantic coast", "urban access", "four-season climate"]],
  MI: ["Michigan", "Great Lakes shoreline, inland lakes, cold winters, peninsula geography", "Great Lakes climate with water access and winter-season context", ["Great Lakes", "inland lakes", "cold winters"]],
  MN: ["Minnesota", "Upper Midwest lakes, cold winters, forests and plains, ice and snow season", "Cold continental climate with lake, snow, and ice-environment context", ["lakes", "cold winters", "snow season"]],
  MS: ["Mississippi", "River plain, Gulf-influenced humid climate, lowland terrain", "Humid lowland climate with river and coastal-influence context", ["river plain", "humid climate", "lowlands"]],
  MO: ["Missouri", "Ozark terrain, river corridors, plains transition, humid continental climate", "Inland climate with river, hill, and plains-transition context", ["Ozarks", "river corridors", "plains transition"]],
  MT: ["Montana", "Rocky Mountains, high plains, cold winters, large outdoor landscapes", "Mountain and high-plains climate with winter and endurance-environment context", ["Rocky Mountains", "high plains", "cold winters"]],
  NE: ["Nebraska", "Great Plains, river valleys, wind exposure, continental climate", "Plains climate context with river-valley and open-terrain signals", ["Great Plains", "river valleys", "open terrain"]],
  NV: ["Nevada", "Great Basin desert, mountain ranges, dry climate, high-elevation valleys", "Arid high-desert climate with elevation and outdoor-access context", ["Great Basin", "mountains", "dry climate"]],
  NH: ["New Hampshire", "White Mountains, forests, lakes, cold winters, compact coast", "Northern four-season climate with mountain, lake, and winter context", ["mountains", "lakes", "cold winters"]],
  NJ: ["New Jersey", "Atlantic coast, dense urban corridors, coastal plain, seasonal climate", "Mid-Atlantic coastal and urban-corridor climate context", ["Atlantic coast", "urban corridor", "coastal plain"]],
  NM: ["New Mexico", "High desert, mountain ranges, dry climate, higher-elevation communities", "Arid high-elevation climate with mountain and desert context", ["high desert", "mountains", "dry climate"]],
  NY: ["New York", "Atlantic coast, Great Lakes, Adirondacks, large urban infrastructure, four-season climate", "Four-season climate with urban, coastal, lake, and mountain context", ["urban infrastructure", "coast", "mountains"]],
  NC: ["North Carolina", "Atlantic coast, Piedmont, Blue Ridge mountains, humid climate", "Humid climate with coast-to-mountain geography and mixed sport-access context", ["coast", "Piedmont", "Blue Ridge"]],
  ND: ["North Dakota", "Northern plains, cold winters, wind exposure, river valleys", "Cold plains climate with open-terrain and winter-environment context", ["northern plains", "cold winters", "wind exposure"]],
  OH: ["Ohio", "Great Lakes shoreline, river valleys, large metro regions, humid continental climate", "Great Lakes and river-valley climate context with broad urban access", ["Great Lakes", "river valleys", "metro regions"]],
  OK: ["Oklahoma", "Southern plains, heat, wind exposure, rolling terrain, mixed urban access", "Southern plains climate with heat, wind, and open-terrain context", ["southern plains", "heat", "wind exposure"]],
  OR: ["Oregon", "Pacific coast, Cascade mountains, high desert, rivers, wet and dry climate zones", "Pacific Northwest climate with coast, mountain, and high-desert context", ["coast", "Cascade mountains", "high desert"]],
  PA: ["Pennsylvania", "Appalachian ridges, river valleys, dense metro corridors, four-season climate", "Mid-Atlantic climate with ridges, rivers, and urban-corridor context", ["Appalachian ridges", "river valleys", "urban corridors"]],
  RI: ["Rhode Island", "Atlantic shoreline, bays, dense coastal towns, four-season climate", "Compact coastal climate with bay and shoreline access context", ["Atlantic shoreline", "bays", "coastal towns"]],
  SC: ["South Carolina", "Atlantic coast, coastal plain, Piedmont, humid subtropical climate", "Warm coastal and inland climate with shoreline and Piedmont context", ["Atlantic coast", "coastal plain", "Piedmont"]],
  SD: ["South Dakota", "Northern plains, Badlands, Black Hills, cold winters, open terrain", "Plains climate with hill, open-terrain, and winter-environment context", ["northern plains", "Black Hills", "cold winters"]],
  TN: ["Tennessee", "Appalachian mountains, river valleys, humid climate, large music-city metro corridor", "Humid inland climate with mountain, valley, and urban-access context", ["Appalachians", "river valleys", "urban access"]],
  TX: ["Texas", "Gulf Coast, plains, hill country, desert edge, major metro regions, heat", "Large-state climate mix with heat, coastal, plains, and urban-infrastructure context", ["Gulf Coast", "plains", "heat", "metro regions"]],
  UT: ["Utah", "High elevation, Wasatch mountains, desert basins, winter access, outdoor terrain", "High-elevation and desert-mountain climate with winter and endurance context", ["higher elevation", "mountains", "desert basins"]],
  VT: ["Vermont", "Green Mountains, forests, cold winters, lakes and river valleys", "Northern mountain climate with winter, forest, and valley context", ["Green Mountains", "forests", "cold winters"]],
  VI: ["U.S. Virgin Islands", "Caribbean islands, coastal waters, tropical climate, ocean access", "Tropical island climate with coastal and water-environment context", ["Caribbean islands", "ocean access", "tropical climate"]],
  VA: ["Virginia", "Atlantic coast, Piedmont, Blue Ridge, river corridors, dense metro access", "Mid-Atlantic climate with coast-to-mountain and urban-corridor context", ["coast", "Piedmont", "Blue Ridge"]],
  WA: ["Washington", "Pacific coast, Cascade mountains, Puget Sound, wet west and dry east climate zones", "Pacific Northwest climate with coastal, mountain, and endurance-environment context", ["coast", "Cascade mountains", "Puget Sound"]],
  WV: ["West Virginia", "Appalachian mountains, river valleys, forests, humid continental climate", "Mountain and river-valley climate with outdoor terrain context", ["Appalachians", "river valleys", "forests"]],
  WI: ["Wisconsin", "Great Lakes, inland lakes, cold winters, forests and plains", "Upper Midwest climate with lake, snow, and plains-forest context", ["Great Lakes", "inland lakes", "cold winters"]],
  WY: ["Wyoming", "Rocky Mountains, high plains, cold winters, high elevation, open terrain", "High-elevation plains and mountain climate with winter and endurance context", ["higher elevation", "mountains", "open terrain"]]
};

const SPORT_FAMILY_RULES = [
  [/alpine skiing|freestyle skiing|cross-country skiing|para nordic skiing|para biathlon|biathlon|nordic combined|ski jump|ski mountaineering|snowboarding|para snowboarding|luge|bobsled|skeleton|speedskating|short track/i, "Endurance / Winter Equipment"],
  [/track|triathlon|cycling|rowing|canoe|marathon|race walk/i, "Endurance / Pace Control"],
  [/swimming|diving|water polo|surfing|sailing|artistic swimming/i, "Aquatic / Water Environment"],
  [/basketball|soccer|volleyball|rugby|field hockey|ice hockey|sled hockey|handball|baseball|softball|goalball/i, "Team / Spatial Awareness"],
  [/gymnastics|skateboarding|sport climbing|breaking|equestrian|figure skating/i, "Balance / Technical Control"],
  [/shooting|archery|fencing|table tennis|tennis|badminton|golf|curling|wheelchair curling/i, "Precision / Focus"],
  [/boxing|wrestling|judo|taekwondo|powerlifting|weightlifting/i, "Power / Contact Control"],
  [/pentathlon/i, "Mixed Skill / Adaptability"]
];

const TRAITS = [
  {
    match: /Endurance|Aquatic|Winter/,
    name: "Rhythm and Pace Control",
    description: "Steady timing, controlled effort, and repeatable rhythm across different sport environments.",
    challengeType: "cadence_keeper"
  },
  {
    match: /Precision|Team/,
    name: "Spatial Timing",
    description: "Fast recognition, clean timing, and attention to changing space across sport families.",
    challengeType: "reaction_grid"
  },
  {
    match: /Balance|Power|Mixed/,
    name: "Control Under Pressure",
    description: "Focused choices, body control, and well-timed actions in short windows.",
    challengeType: "reaction_grid"
  }
];

const SPORT_CANDIDATE_LIMIT = 8;
const HOMETOWN_SIGNAL_LIMIT = 3;
const HOMETOWN_SIGNAL_MINIMUM = 1;

const args = parseArgs(process.argv.slice(2));
const retrievedAt = args.retrievedAt || new Date().toISOString().slice(0, 10);
const outputPath = path.resolve(appRoot, args.output || "public/data/state-cards.json");

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const rosterPayloads = await loadRosterPayloads();

  const aggregate = createEmptyAggregate();
  const scopeAggregates = Object.fromEntries(
    DATA_SCOPES.filter((scope) => scope.id !== "both").map((scope) => [scope.id, createEmptyAggregate()])
  );
  const excludedStateCodes = new Set();
  const blankStateProgramBuckets = new Set();
  const excludedRowsByProgram = createExcludedRowsByProgram();

  for (const payload of rosterPayloads) {
    ingestEntries(aggregate, payload.data.entries || [], payload.source, excludedStateCodes, blankStateProgramBuckets, excludedRowsByProgram);
    const scopedAggregate = scopeAggregates[payload.source.gamesScope];
    if (scopedAggregate) {
      ingestEntries(
        scopedAggregate,
        payload.data.entries || [],
        payload.source,
        new Set(),
        new Set(),
        createExcludedRowsByProgram()
      );
    }
  }

  const dataset = buildDataset({
    aggregate,
    scopeAggregates,
    retrievedAt,
    rosterPayloads,
    excludedStateCodes: [...excludedStateCodes].sort(),
    blankStateProgramBuckets: [...blankStateProgramBuckets].sort(),
    excludedRowsByProgram
  });

  assertSafeFrontendDataset(dataset);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  console.log(`Wrote ${dataset.states.length} geography cards to ${outputPath}`);
}

function createExcludedRowsByProgram() {
  return {
    olympic: {},
    paralympic: {}
  };
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    parsed[key] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return parsed;
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}

async function loadRosterPayloads() {
  if (args.olympic || args.paralympic) {
    const localSources = [];
    if (args.olympic) {
      localSources.push({
        source: ROSTER_SOURCES.find((source) => source.id === "paris2024Olympic"),
        data: await readJsonFile(args.olympic)
      });
    }
    if (args.paralympic) {
      localSources.push({
        source: ROSTER_SOURCES.find((source) => source.id === "paris2024Paralympic"),
        data: await readJsonFile(args.paralympic)
      });
    }
    return localSources;
  }

  return Promise.all(ROSTER_SOURCES.map(async (source) => ({
    source,
    data: await fetchRoster(source.contentTag, source.limit)
  })));
}

async function fetchRoster(contentTags, limit) {
  const params = new URLSearchParams({
    skip: "0",
    limit: String(limit),
    contentTags,
    matchAllTags: "false"
  });
  const response = await fetch(`https://www.teamusa.com/api/athletes?${params}`, {
    headers: { "User-Agent": "Common Ground public-data prototype" }
  });
  if (!response.ok) throw new Error(`Team USA API request failed for ${contentTags}: ${response.status}`);
  return response.json();
}

function createEmptyAggregate() {
  return Object.fromEntries(Object.keys(STATE_CONTEXT).map((code) => [
    code,
    {
      athleteKeys: new Set(),
      olympic: emptyProgramAggregate(),
      paralympic: emptyProgramAggregate()
    }
  ]));
}

function emptyProgramAggregate() {
  return {
    records: 0,
    athleteKeys: new Set(),
    sportKeys: new Set(),
    sports: new Map(),
    families: new Map(),
    hometownAreas: new Map()
  };
}

function ingestEntries(aggregate, entries, source, excludedStateCodes, blankStateProgramBuckets, excludedRowsByProgram) {
  const { program } = source;
  for (const athlete of entries) {
    const stateCode = normalizeStateCode(athlete?.bio?.quick_facts?.hometown?.state);
    if (!stateCode) {
      blankStateProgramBuckets.add(program);
      incrementExcluded(excludedRowsByProgram[program], "(blank)");
      continue;
    }
    if (!aggregate[stateCode]) {
      excludedStateCodes.add(stateCode);
      incrementExcluded(excludedRowsByProgram[program], stateCode);
      continue;
    }

    const athleteKey = athleteDedupeKey(athlete);
    const programAggregate = aggregate[stateCode][program];
    const firstStateProgramAppearance = !programAggregate.athleteKeys.has(athleteKey);
    if (firstStateProgramAppearance) {
      programAggregate.athleteKeys.add(athleteKey);
      aggregate[stateCode].athleteKeys.add(athleteKey);
      programAggregate.records += 1;
    }

    const city = normalizeCityName(athlete?.bio?.quick_facts?.hometown?.city);
    if (city && firstStateProgramAppearance) incrementHometownArea(programAggregate.hometownAreas, city, program);

    const sportTitles = unique((athlete.sport || []).map((sport) => sport?.title).filter(Boolean));
    for (const title of sportTitles) {
      const sportKey = `${athleteKey}::${normalizeSportKey(title)}`;
      if (programAggregate.sportKeys.has(sportKey)) continue;
      programAggregate.sportKeys.add(sportKey);
      increment(programAggregate.sports, title);
      increment(programAggregate.families, sportFamilyFor(title));
    }
  }
}

function athleteDedupeKey(athlete) {
  const explicitKey = athlete?.url || athlete?.uid;
  if (explicitKey) return String(explicitKey).trim().toLowerCase();
  const first = String(athlete?.first_name || "").replace(/\s+/g, " ").trim().toLowerCase();
  const last = String(athlete?.last_name || "").replace(/\s+/g, " ").trim().toLowerCase();
  const birthday = String(athlete?.bio?.quick_facts?.birthday || "").slice(0, 10);
  const city = String(athlete?.bio?.quick_facts?.hometown?.city || "").replace(/\s+/g, " ").trim().toLowerCase();
  const state = String(athlete?.bio?.quick_facts?.hometown?.state || "").trim().toLowerCase();
  return [first, last, birthday, city, state].filter(Boolean).join("|");
}

function normalizeSportKey(title) {
  return String(title || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function incrementExcluded(target, key) {
  target[key] = (target[key] || 0) + 1;
}

function normalizeStateCode(value) {
  if (!value || typeof value !== "string") return "";
  return value.trim().toUpperCase();
}

function normalizeCityName(value) {
  if (!value || typeof value !== "string") return "";
  return titleCase(value.replace(/\s+/g, " ").trim());
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function incrementHometownArea(map, city, program) {
  const current = map.get(city) || { city, olympic: 0, paralympic: 0, total: 0 };
  current[program] += 1;
  current.total += 1;
  map.set(city, current);
}

function sportFamilyFor(title) {
  const match = SPORT_FAMILY_RULES.find(([pattern]) => pattern.test(title));
  return match ? match[1] : "Mixed Sport Context";
}

function buildDataset({ aggregate, scopeAggregates = {}, retrievedAt, rosterPayloads, excludedStateCodes, blankStateProgramBuckets, excludedRowsByProgram }) {
  const rosterSourceRefs = buildRosterSourceRefs(ROSTER_SOURCES, retrievedAt);
  const globalSourceRefs = [
    {
      label: "NOAA public climate context",
      url: SOURCE_URLS.noaa,
      sourceType: "noaa",
      retrievedAt
    },
    {
      label: "us-atlas TopoJSON derived from U.S. Census cartographic state and territory boundaries",
      url: SOURCE_URLS.usAtlas,
      sourceType: "geography",
      retrievedAt
    }
  ];
  const sourceRefs = [...rosterSourceRefs, ...globalSourceRefs];
  const states = buildStatesForAggregate({
    aggregate,
    rosterSourceRefs,
    datasetScopeLabel: "combined Paris 2024 and Milano Cortina 2026 public roster view"
  });
  const scopedStateLists = Object.fromEntries(
    DATA_SCOPES
      .filter((scope) => scope.id !== "both")
      .map((scope) => [
        scope.id,
        buildStatesForAggregate({
          aggregate: scopeAggregates[scope.id] || createEmptyAggregate(),
          rosterSourceRefs: rosterSourceRefs.filter((ref) => scope.rosterSourceIds.includes(ref.id)),
          datasetScopeLabel: `${scope.label} public roster view`
        })
      ])
  );
  const scopedStateMaps = Object.fromEntries(
    Object.entries(scopedStateLists).map(([scopeId, list]) => [scopeId, new Map(list.map((card) => [card.stateCode, card]))])
  );
  const statesWithScopes = states.map((state) => ({
    ...state,
    dataScopes: Object.fromEntries(
      Object.entries(scopedStateMaps).map(([scopeId, stateMap]) => [scopeId, stateMap.get(state.stateCode)])
    )
  }));
  const stateCodedRecordTotals = stateCodedRecordTotalsForAggregate(aggregate);
  const scopedStateCodedRecordTotals = {
    both: stateCodedRecordTotals,
    ...Object.fromEntries(
      Object.entries(scopeAggregates).map(([scopeId, scopedAggregate]) => [scopeId, stateCodedRecordTotalsForAggregate(scopedAggregate)])
    )
  };

  return {
    meta: {
      appName: "Common Ground",
      datasetLabel: "Official TeamUSA.com Paris 2024 and Milano Cortina 2026 public roster aggregate by hometown state and sport family.",
      updatedAt: retrievedAt,
      dataScopes: DATA_SCOPES,
      sourceProgramRecordTotals: sourceProgramTotals(rosterPayloads),
      sourceRosterTotals: sourceRosterTotals(rosterPayloads),
      stateCodedRecordTotals,
      scopedStateCodedRecordTotals,
      aggregationPolicy: "The build script deduplicates athletes across imported TeamUSA.com roster sources in memory, then strips athlete names, profile URLs, images, biographies, medals, finish placements, and other individual-level fields before writing frontend data. State cards display aggregate public Team USA athlete counts only where needed for fan context.",
      hometownAreaPolicy: `Top hometown areas are city-level aggregate public athlete counts only, require at least ${HOMETOWN_SIGNAL_MINIMUM} public athlete${HOMETOWN_SIGNAL_MINIMUM === 1 ? "" : "s"}, and do not expose athlete names, profiles, images, or individual records.`,
      bucketPolicy: "Combined state bucket: insufficient data = 0 sourced public athletes, low = 1-4, medium = 5-19, high = 20+. Low-volume program panels may show a fallback sport cue when public athletes exist; stronger featured sport signals have 3+ sourced public athletes.",
      coverageNote: "Only TeamUSA.com Paris 2024 and Milano Cortina 2026 roster records with a U.S. state or supported U.S. territory abbreviation in the public hometown state field are used for cards. Unsupported or blank geography values are excluded from card output.",
      excludedStateCodes,
      blankStateProgramBuckets,
      excludedRowsByProgram,
      sourceRefs
    },
    states: statesWithScopes
  };
}

function buildRosterSourceRefs(sources, retrievedAt) {
  return sources.map((source) => ({
    id: source.id,
    label: source.label,
    url: source.url,
    sourceType: "teamusa",
    gamesScope: source.gamesScope,
    gamesLabel: source.gamesLabel,
    program: source.program,
    retrievedAt
  }));
}

function buildStatesForAggregate({ aggregate, rosterSourceRefs, datasetScopeLabel }) {
  const sourceRefsByProgram = {
    olympic: rosterSourceRefs.filter((source) => source.program === "olympic"),
    paralympic: rosterSourceRefs.filter((source) => source.program === "paralympic")
  };

  return Object.entries(STATE_CONTEXT).map(([stateCode, context]) => {
    const [stateName, geographySnapshot, climateSignal, terrainSignals] = context;
    const stateAggregate = aggregate[stateCode];
    const baseOlympicPanel = buildPanel({
      stateName,
      stateCode,
      program: "olympic",
      label: "Olympic Sport Family",
      aggregate: stateAggregate.olympic,
      geographySnapshot,
      sourceRefs: sourceRefsByProgram.olympic,
      datasetScopeLabel
    });
    const baseParalympicPanel = buildPanel({
      stateName,
      stateCode,
      program: "paralympic",
      label: "Paralympic Sport Family",
      aggregate: stateAggregate.paralympic,
      geographySnapshot,
      sourceRefs: sourceRefsByProgram.paralympic,
      datasetScopeLabel
    });
    const totalRecords = stateAggregate.athleteKeys.size;
    const cardStory = buildCardStory({
      stateName,
      geographySnapshot,
      climateSignal,
      terrainSignals,
      olympicPanel: baseOlympicPanel,
      paralympicPanel: baseParalympicPanel
    });
    const olympicPanel = applyFeaturedSport(baseOlympicPanel, cardStory.olympicFeatured);
    const paralympicPanel = applyFeaturedSport(baseParalympicPanel, cardStory.paralympicFeatured);
    const hometownSignals = buildHometownSignals(stateAggregate);

    return {
      stateCode,
      stateName,
      geographySnapshot,
      climateSignal,
      terrainSignals,
      hometownRosterCounts: {
        olympic: stateAggregate.olympic.records,
        paralympic: stateAggregate.paralympic.records,
        total: totalRecords
      },
      topHometownSignals: hometownSignals.top,
      allHometownSignals: hometownSignals.all,
      hometownPresenceBucket: combinedBucket(totalRecords),
      olympicPanel,
      paralympicPanel,
      sharedTrait: cardStory.sharedTrait,
      cardStory,
      minimumAggregationPassed: totalRecords >= 3,
      sourceRefs: rosterSourceRefs
    };
  });
}

function stateCodedRecordTotalsForAggregate(aggregate) {
  return Object.entries(aggregate).reduce(
    (totals, [stateCode, stateAggregate]) => ({
      olympic: totals.olympic + stateAggregate.olympic.records,
      paralympic: totals.paralympic + stateAggregate.paralympic.records,
      total: totals.total + aggregate[stateCode].athleteKeys.size
    }),
    { olympic: 0, paralympic: 0, total: 0 }
  );
}

function sourceProgramTotals(rosterPayloads = []) {
  return rosterPayloads.reduce(
    (totals, payload) => {
      totals[payload.source.program] += Number(payload.data.total || 0);
      return totals;
    },
    { olympic: 0, paralympic: 0 }
  );
}

function sourceRosterTotals(rosterPayloads = []) {
  return Object.fromEntries(rosterPayloads.map((payload) => [
    payload.source.id,
    {
      label: payload.source.label,
      program: payload.source.program,
      gamesScope: payload.source.gamesScope,
      gamesLabel: payload.source.gamesLabel,
      total: payload.data.total || null
    }
  ]));
}

function buildHometownSignals(stateAggregate) {
  const merged = new Map();
  for (const program of ["olympic", "paralympic"]) {
    for (const area of stateAggregate[program].hometownAreas.values()) {
      const current = merged.get(area.city) || { city: area.city, olympic: 0, paralympic: 0, total: 0 };
      current.olympic += area.olympic;
      current.paralympic += area.paralympic;
      current.total += area.total;
      merged.set(area.city, current);
    }
  }

  const all = [...merged.values()]
    .filter((area) => area.total >= HOMETOWN_SIGNAL_MINIMUM)
    .sort((a, b) => b.total - a.total || b.olympic - a.olympic || a.city.localeCompare(b.city))
    .map((area, index) => ({
      rank: index + 1,
      areaType: "city",
      label: area.city,
      total: area.total,
      olympic: area.olympic,
      paralympic: area.paralympic,
      countLabel: "public athletes"
    }));

  return {
    top: all.slice(0, HOMETOWN_SIGNAL_LIMIT),
    all
  };
}

function buildPanel({ stateName, program, label, aggregate, geographySnapshot, sourceRefs, datasetScopeLabel = "selected public roster view" }) {
  const signal = panelBucket(aggregate.records, program);
  const sportTagCandidates = sportCandidates(aggregate.sports, program);
  const allSports = sportTagsByCount(aggregate.sports);
  const topSports = sportTagCandidates.slice(0, 3).map((candidate) => candidate.sportTag);
  const topFamilies = topKeys(aggregate.families, 2);
  const programName = program === "olympic" ? "Olympic" : "Paralympic";

  if (aggregate.records === 0) {
    return {
      program,
      label,
      sourceAthleteCount: aggregate.records,
      sportFamily: "No sourced public roster signal",
      aggregateSignal: "insufficient_data",
      primarySportTag: null,
      topSportTags: [],
      allSportTags: [],
      sportTagCandidates: [],
      geographyConnection: `${stateName} has no public ${programName} hometown geography roster signal in this ${datasetScopeLabel}.`,
      geminiNote: "This panel stays visible for parity, but it does not infer sport-family patterns without sourced aggregate signal.",
      sourceRefs
    };
  }

  if (aggregate.records < 3) {
    const familyLabel = topFamilies.join(" + ") || "Low-volume public roster signal";
    const sportLabel = topSports.length ? joinList(topSports) : "a low-volume sport tag";
    return {
      program,
      label,
      sourceAthleteCount: aggregate.records,
      sportFamily: familyLabel,
      aggregateSignal: signal,
      primarySportTag: topSports[0] || null,
      topSportTags: topSports,
      allSportTags: allSports,
      sportTagCandidates,
      geographyConnection: `${geographySnapshot} could help fans frame a low-volume ${programName} sport signal without treating geography as a performance cause.`,
      geminiNote: `Low-volume fallback: public roster tags in this panel include ${sportLabel}; this is a state-card cue, not an athlete-level claim.`,
      sourceRefs
    };
  }

  const familyLabel = topFamilies.join(" + ");
  const sportLabel = topSports.length ? joinList(topSports) : "multiple public roster sport tags";
  return {
    program,
    label,
    sourceAthleteCount: aggregate.records,
    sportFamily: familyLabel,
    aggregateSignal: signal,
    primarySportTag: topSports[0] || null,
    topSportTags: topSports,
    allSportTags: allSports,
    sportTagCandidates,
    geographyConnection: `${geographySnapshot} could help fans frame the state's ${programName} sport-family presence without implying geography causes outcomes.`,
    geminiNote: `Public roster tags in this panel include ${sportLabel}; the state context may suggest a fan discovery lens, not a performance claim.`,
    sourceRefs
  };
}

function sportTagsByCount(map) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([sportTag]) => sportTag);
}

function sportCandidates(map, program) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, SPORT_CANDIDATE_LIMIT)
    .map(([sportTag, count], index) => {
      const sportFamily = sportFamilyFor(sportTag);
      return {
        sportTag,
        recordCount: count,
        rank: index + 1,
        bucket: sportTagBucket(count, program),
        sportFamily,
        themeTags: themeTagsForSport(sportTag, sportFamily)
      };
    });
}

function sportTagBucket(count, program) {
  if (count <= 0) return "insufficient_data";
  if (program === "paralympic") {
    if (count >= 5) return "high";
    if (count >= 3) return "medium";
    return "low";
  }
  if (count >= 8) return "high";
  if (count >= 3) return "medium";
  return "low";
}

function themeTagsForSport(title, family = sportFamilyFor(title)) {
  const text = `${title} ${family}`.toLowerCase();
  const tags = new Set();
  if (/aquatic|water|swimming|water polo|surfing|sailing|rowing|canoe|triathlon|paratriathlon/.test(text)) {
    tags.add("water");
    tags.add("rhythm");
  }
  if (/coast|surfing|sailing|water polo/.test(text)) tags.add("coastal");
  if (/track|triathlon|cycling|rowing|canoe|marathon|race walk|endurance/.test(text)) {
    tags.add("endurance");
    tags.add("pace");
    tags.add("rhythm");
    tags.add("outdoor");
  }
  if (/team|basketball|soccer|volleyball|rugby|field hockey|ice hockey|sled hockey|handball|baseball|softball|goalball|water polo/.test(text)) {
    tags.add("team");
    tags.add("spatial");
  }
  if (/precision|shooting|archery|fencing|table tennis|tennis|badminton|golf|curling|wheelchair curling/.test(text)) {
    tags.add("precision");
    tags.add("focus");
    tags.add("control");
  }
  if (/balance|gymnastics|skateboarding|sport climbing|breaking|equestrian|surfing|figure skating/.test(text)) {
    tags.add("balance");
    tags.add("technical");
    tags.add("control");
  }
  if (/power|boxing|wrestling|judo|taekwondo|powerlifting|weightlifting/.test(text)) {
    tags.add("power");
    tags.add("control");
  }
  if (/winter|skiing|biathlon|snow|ice|bobsled|luge|skeleton|speedskating|curling/.test(text)) {
    tags.add("winter");
    tags.add("equipment");
    tags.add("endurance");
  }
  if (/wheelchair|para/.test(text)) tags.add("adaptive");
  if (!tags.size) tags.add("mixed");
  return [...tags].sort();
}

function buildCardStory({ stateName, geographySnapshot, climateSignal, terrainSignals, olympicPanel, paralympicPanel }) {
  const geographyTags = geographyTagsForState(geographySnapshot, climateSignal, terrainSignals);
  const pair = chooseFeaturedPair(olympicPanel.sportTagCandidates, paralympicPanel.sportTagCandidates, geographyTags);
  const olympicFeatured = serializeFeaturedCandidate(pair.olympic, "olympic");
  const paralympicFeatured = serializeFeaturedCandidate(pair.paralympic, "paralympic");
  const sharedTrait = chooseSharedTraitForFeatured(olympicFeatured, paralympicFeatured, olympicPanel, paralympicPanel);
  const themeName = cardThemeName({ stateName, geographyTags, olympicFeatured, paralympicFeatured, sharedTrait });

  return {
    themeName,
    geographySignal: geographySignalLabels(geographySnapshot),
    olympicFeatured,
    paralympicFeatured,
    sharedTrait,
    fanChallengeName: fanChallengeName(themeName, sharedTrait),
    pairingPolicy: "sourced_coherent",
    pairingScore: Number(pair.score.toFixed(2))
  };
}

function chooseFeaturedPair(olympicCandidates = [], paralympicCandidates = [], geographyTags = []) {
  const fallback = {
    olympic: olympicCandidates[0] || null,
    paralympic: paralympicCandidates[0] || null,
    score: 0
  };
  if (!olympicCandidates.length || !paralympicCandidates.length) return fallback;

  const scored = [];
  for (const olympic of olympicCandidates) {
    for (const paralympic of paralympicCandidates) {
      scored.push({
        olympic,
        paralympic,
        score: pairScore(olympic, paralympic, geographyTags)
      });
    }
  }

  const topPairScore = pairScore(olympicCandidates[0], paralympicCandidates[0], geographyTags);
  const best = scored.sort((a, b) =>
    b.score - a.score ||
    a.olympic.rank + a.paralympic.rank - (b.olympic.rank + b.paralympic.rank) ||
    a.olympic.sportTag.localeCompare(b.olympic.sportTag) ||
    a.paralympic.sportTag.localeCompare(b.paralympic.sportTag)
  )[0];

  return best.score >= topPairScore + 0.5 ? best : { ...fallback, score: topPairScore };
}

function pairScore(olympic, paralympic, geographyTags = []) {
  if (!olympic || !paralympic) return 0;
  const olympicTags = new Set(olympic.themeTags || []);
  const paralympicTags = new Set(paralympic.themeTags || []);
  const geography = new Set(geographyTags);
  const shared = [...olympicTags].filter((tag) => paralympicTags.has(tag));
  const geoFit = [...new Set([...olympicTags, ...paralympicTags])].filter((tag) => geography.has(tag));
  const rankScore = (SPORT_CANDIDATE_LIMIT + 1 - olympic.rank) + (SPORT_CANDIDATE_LIMIT + 1 - paralympic.rank);
  const coastalBonus = geography.has("coastal") && (olympicTags.has("water") || paralympicTags.has("water")) ? 6 : 0;
  const winterBonus = geography.has("winter") && (olympicTags.has("winter") || paralympicTags.has("winter")) ? 6 : 0;
  const mountainBonus = geography.has("mountain") && (olympicTags.has("endurance") || paralympicTags.has("endurance")) ? 3 : 0;
  return shared.length * 6 + geoFit.length * 5 + rankScore * 1.3 + coastalBonus + winterBonus + mountainBonus;
}

function geographyTagsForState(geographySnapshot, climateSignal, terrainSignals = []) {
  const text = `${geographySnapshot} ${climateSignal} ${terrainSignals.join(" ")}`.toLowerCase();
  const tags = new Set(["outdoor"]);
  if (/coast|ocean|island|gulf|bay|sound|peninsula|shore|water|lake|river/.test(text)) {
    tags.add("water");
    tags.add("coastal");
  }
  if (/mountain|elevation|alpine|ridge|foothill/.test(text)) {
    tags.add("mountain");
    tags.add("endurance");
  }
  if (/snow|winter|cold|ice/.test(text)) tags.add("winter");
  if (/desert|dry|heat|arid/.test(text)) {
    tags.add("heat");
    tags.add("endurance");
  }
  if (/urban|metro|city|infrastructure|dense/.test(text)) {
    tags.add("urban");
    tags.add("team");
    tags.add("spatial");
  }
  if (/plains|wind|open terrain|prairie/.test(text)) {
    tags.add("pace");
    tags.add("endurance");
  }
  return [...tags].sort();
}

function serializeFeaturedCandidate(candidate, program) {
  if (!candidate) {
    return {
      program,
      sportTag: null,
      sportFamily: "Generalized sport-family",
      recordCount: null,
      rank: null,
      bucket: "insufficient_data",
      themeTags: []
    };
  }
  return {
    program,
    sportTag: candidate.sportTag,
    sportFamily: candidate.sportFamily,
    recordCount: candidate.recordCount,
    rank: candidate.rank,
    bucket: candidate.bucket,
    themeTags: candidate.themeTags
  };
}

function applyFeaturedSport(panel, featured) {
  if (!featured?.sportTag) return panel;
  return {
    ...panel,
    primarySportTag: featured.sportTag,
    sportFamily: featured.sportFamily,
    featuredSportRecordCount: featured.recordCount,
    featuredSportRank: featured.rank,
    featuredSportBucket: featured.bucket
  };
}

function chooseSharedTraitForFeatured(olympicFeatured, paralympicFeatured, olympicPanel, paralympicPanel) {
  const tags = new Set([...(olympicFeatured?.themeTags || []), ...(paralympicFeatured?.themeTags || [])]);
  if (tags.has("water") && (tags.has("pace") || tags.has("rhythm") || tags.has("balance"))) {
    return {
      name: "Rhythm in changing conditions",
      description: "Timing, spacing, and controlled rhythm when movement conditions keep changing.",
      challengeType: "cadence_keeper"
    };
  }
  if (tags.has("winter") || tags.has("mountain")) {
    return {
      name: "Elevation Pace",
      description: "Steady pacing and controlled decisions across terrain, weather, and equipment demands.",
      challengeType: "cadence_keeper"
    };
  }
  if (tags.has("precision") || tags.has("focus")) {
    return {
      name: "Focus Timing",
      description: "Clean recognition, controlled timing, and repeatable focus under changing conditions.",
      challengeType: "reaction_grid"
    };
  }
  if (tags.has("team") || tags.has("spatial")) {
    return {
      name: "Spatial Timing",
      description: "Fast recognition, clean timing, and attention to changing space across sport families.",
      challengeType: "reaction_grid"
    };
  }
  return chooseSharedTrait(olympicPanel, paralympicPanel);
}

function cardThemeName({ geographyTags, olympicFeatured, paralympicFeatured, sharedTrait }) {
  const tags = new Set([...(olympicFeatured?.themeTags || []), ...(paralympicFeatured?.themeTags || [])]);
  if (geographyTags.includes("coastal") && tags.has("water")) return "Rhythm in changing conditions";
  if (geographyTags.includes("winter")) return "Cold Pace";
  if (geographyTags.includes("mountain")) return "Elevation Pace";
  if (geographyTags.includes("heat")) return "Heat Control";
  if (geographyTags.includes("urban") && tags.has("team")) return "City Timing";
  if (tags.has("precision")) return "Focus Lines";
  return sharedTrait?.name || "State Sync";
}

function geographySignalLabels(geographySnapshot) {
  return geographySnapshot
    .split(",")
    .map((item) => titleCase(item.trim()))
    .filter(Boolean)
    .slice(0, 5);
}

function fanChallengeName(themeName, sharedTrait) {
  if (/coastal|water|rhythm/i.test(themeName) && sharedTrait?.challengeType === "cadence_keeper") return "Rhythm Shift Challenge";
  if (/elevation|cold|pace/i.test(themeName)) return "Pace Control Challenge";
  if (/focus/i.test(themeName) || sharedTrait?.challengeType === "reaction_grid") return "Focus Window Challenge";
  if (/city|spatial/i.test(themeName) || /spatial/i.test(sharedTrait?.name || "")) return "Spatial Timing Challenge";
  return `${sharedTrait?.name || "State Sync"} Challenge`;
}

function titleCase(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function topKeys(map, limit) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key]) => key);
}

function panelBucket(records, program) {
  if (records === 0) return "insufficient_data";
  if (program === "paralympic") {
    if (records >= 10) return "high";
    if (records >= 5) return "medium";
    return "low";
  }
  if (records >= 20) return "high";
  if (records >= 5) return "medium";
  return "low";
}

function combinedBucket(records) {
  if (records === 0) return "insufficient_data";
  if (records >= 20) return "high";
  if (records >= 5) return "medium";
  return "low";
}

function chooseSharedTrait(olympicPanel, paralympicPanel) {
  const combinedFamily = `${olympicPanel.sportFamily} ${paralympicPanel.sportFamily}`;
  const matchedTrait = TRAITS.find((trait) => trait.match.test(combinedFamily));
  if (matchedTrait) return serializeTrait(matchedTrait);
  return {
    name: "Signal Discovery",
    description: "Careful attention to changing map signals and source context in a low-stakes fan challenge.",
    challengeType: "reaction_grid"
  };
}

function serializeTrait(trait) {
  return {
    name: trait.name,
    description: trait.description,
    challengeType: trait.challengeType
  };
}

function joinList(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function unique(values) {
  return [...new Set(values)];
}

function assertSafeFrontendDataset(dataset) {
  const output = JSON.stringify(dataset);
  const forbiddenKeys = [
    "\"first_name\"",
    "\"last_name\"",
    "\"birthday\"",
    "\"biography\"",
    "\"image\"",
    "\"thumbnail_image_list\"",
    "\"hero_image\"",
    "\"medals\"",
    "\"url\":\"/profiles"
  ];
  const found = forbiddenKeys.filter((token) => output.includes(token));
  if (found.length) {
    throw new Error(`Unsafe individual-level fields leaked into frontend dataset: ${found.join(", ")}`);
  }
}
