import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

const OLYMPIC_TAG = "Olympic Games Paris 2024, Qualified";
const PARALYMPIC_TAG = "Paralympic Games Paris 2024, Qualified";

const SOURCE_URLS = {
  olympic: "https://www.teamusa.com/paris-2024/olympics/roster",
  paralympic: "https://www.teamusa.com/paris-2024/paralympics/roster",
  usAtlas: "https://github.com/topojson/us-atlas",
  noaa: "https://www.noaa.gov/climate"
};

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
  [/para nordic skiing|para biathlon/i, "Endurance / Winter Equipment"],
  [/track|triathlon|cycling|rowing|canoe|marathon|race walk/i, "Endurance / Pace Control"],
  [/swimming|diving|water polo|surfing|sailing|artistic swimming/i, "Aquatic / Water Environment"],
  [/basketball|soccer|volleyball|rugby|field hockey|handball|baseball|softball|goalball/i, "Team / Spatial Awareness"],
  [/gymnastics|skateboarding|sport climbing|breaking|equestrian/i, "Balance / Technical Control"],
  [/shooting|archery|fencing|table tennis|tennis|badminton|golf/i, "Precision / Focus"],
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
  const olympicData = args.olympic
    ? await readJsonFile(args.olympic)
    : await fetchRoster(OLYMPIC_TAG, 700);
  const paralympicData = args.paralympic
    ? await readJsonFile(args.paralympic)
    : await fetchRoster(PARALYMPIC_TAG, 400);

  const aggregate = createEmptyAggregate();
  const excludedStateCodes = new Set();
  const blankStateProgramBuckets = new Set();
  const excludedRowsByProgram = {
    olympic: {},
    paralympic: {}
  };

  ingestEntries(aggregate, olympicData.entries || [], "olympic", excludedStateCodes, blankStateProgramBuckets, excludedRowsByProgram);
  ingestEntries(aggregate, paralympicData.entries || [], "paralympic", excludedStateCodes, blankStateProgramBuckets, excludedRowsByProgram);

  const dataset = buildDataset({
    aggregate,
    retrievedAt,
    olympicTotal: olympicData.total,
    paralympicTotal: paralympicData.total,
    excludedStateCodes: [...excludedStateCodes].sort(),
    blankStateProgramBuckets: [...blankStateProgramBuckets].sort(),
    excludedRowsByProgram
  });

  assertSafeFrontendDataset(dataset);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  console.log(`Wrote ${dataset.states.length} geography cards to ${outputPath}`);
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
      olympic: emptyProgramAggregate(),
      paralympic: emptyProgramAggregate()
    }
  ]));
}

function emptyProgramAggregate() {
  return {
    records: 0,
    sports: new Map(),
    families: new Map(),
    hometownAreas: new Map()
  };
}

function ingestEntries(aggregate, entries, program, excludedStateCodes, blankStateProgramBuckets, excludedRowsByProgram) {
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

    const programAggregate = aggregate[stateCode][program];
    programAggregate.records += 1;

    const city = normalizeCityName(athlete?.bio?.quick_facts?.hometown?.city);
    if (city) incrementHometownArea(programAggregate.hometownAreas, city, program);

    const sportTitles = unique((athlete.sport || []).map((sport) => sport?.title).filter(Boolean));
    for (const title of sportTitles) {
      increment(programAggregate.sports, title);
      increment(programAggregate.families, sportFamilyFor(title));
    }
  }
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

function buildDataset({ aggregate, retrievedAt, olympicTotal, paralympicTotal, excludedStateCodes, blankStateProgramBuckets, excludedRowsByProgram }) {
  const sourceRefs = [
    {
      label: "TeamUSA.com Paris 2024 Olympic roster",
      url: SOURCE_URLS.olympic,
      sourceType: "teamusa",
      retrievedAt
    },
    {
      label: "TeamUSA.com Paris 2024 Paralympic roster",
      url: SOURCE_URLS.paralympic,
      sourceType: "teamusa",
      retrievedAt
    },
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

  const states = Object.entries(STATE_CONTEXT).map(([stateCode, context]) => {
    const [stateName, geographySnapshot, climateSignal, terrainSignals] = context;
    const stateAggregate = aggregate[stateCode];
    const baseOlympicPanel = buildPanel({
      stateName,
      stateCode,
      program: "olympic",
      label: "Olympic Sport Family",
      aggregate: stateAggregate.olympic,
      geographySnapshot,
      sourceRef: sourceRefs[0]
    });
    const baseParalympicPanel = buildPanel({
      stateName,
      stateCode,
      program: "paralympic",
      label: "Paralympic Sport Family",
      aggregate: stateAggregate.paralympic,
      geographySnapshot,
      sourceRef: sourceRefs[1]
    });
    const totalRecords = stateAggregate.olympic.records + stateAggregate.paralympic.records;
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
      sourceRefs: sourceRefs.slice(0, 2)
    };
  });
  const stateCodedRecordTotals = states.reduce(
    (totals, state) => ({
      olympic: totals.olympic + aggregate[state.stateCode].olympic.records,
      paralympic: totals.paralympic + aggregate[state.stateCode].paralympic.records
    }),
    { olympic: 0, paralympic: 0 }
  );
  stateCodedRecordTotals.total = stateCodedRecordTotals.olympic + stateCodedRecordTotals.paralympic;

  return {
    meta: {
      appName: "Common Ground",
      datasetLabel: "Official TeamUSA.com Paris 2024 public roster aggregate by hometown state and sport family.",
      updatedAt: retrievedAt,
      sourceProgramRecordTotals: {
        olympic: olympicTotal || null,
        paralympic: paralympicTotal || null
      },
      stateCodedRecordTotals,
      aggregationPolicy: "The build script strips athlete names, profile URLs, images, biographies, medals, finish placements, and other individual-level fields before writing frontend data. State cards display aggregate public Team USA athlete-record counts only where needed for fan context.",
      hometownAreaPolicy: `Top hometown areas are city-level aggregate public source entries only, require at least ${HOMETOWN_SIGNAL_MINIMUM} public source records, and do not expose athlete names, profiles, images, or individual records.`,
      bucketPolicy: "Combined state bucket: insufficient data = 0 sourced roster rows, low = 1-4, medium = 5-19, high = 20+. Program panel details and top sport tags require at least 3 sourced roster rows; lower-volume panels stay generalized.",
      coverageNote: "Only TeamUSA.com roster rows with a U.S. state or supported U.S. territory abbreviation in the public hometown state field are used for cards. Unsupported or blank geography values are excluded from card output.",
      excludedStateCodes,
      blankStateProgramBuckets,
      excludedRowsByProgram,
      sourceRefs
    },
    states
  };
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
      countLabel: "public hometown entries"
    }));

  return {
    top: all.slice(0, HOMETOWN_SIGNAL_LIMIT),
    all
  };
}

function buildPanel({ stateName, program, label, aggregate, geographySnapshot, sourceRef }) {
  const signal = panelBucket(aggregate.records, program);
  const sportTagCandidates = sportCandidates(aggregate.sports, program);
  const topSports = sportTagCandidates.slice(0, 3).map((candidate) => candidate.sportTag);
  const topFamilies = topKeys(aggregate.families, 2);
  const programName = program === "olympic" ? "Olympic" : "Paralympic";

  if (aggregate.records === 0) {
    return {
      program,
      label,
      sportFamily: "No sourced public roster signal",
      aggregateSignal: "insufficient_data",
      primarySportTag: null,
      topSportTags: [],
      sportTagCandidates: [],
      geographyConnection: `${stateName} has no public ${programName} hometown geography roster signal in this TeamUSA.com Paris 2024 dataset.`,
      geminiNote: "This panel stays visible for parity, but it does not infer sport-family patterns without sourced aggregate signal.",
      sourceRefs: [sourceRef]
    };
  }

  if (aggregate.records < 3) {
    return {
      program,
      label,
      sportFamily: "Low-volume public roster signal",
      aggregateSignal: signal,
      primarySportTag: null,
      topSportTags: [],
      sportTagCandidates: [],
      geographyConnection: `The ${programName} roster signal for ${stateName} is too small to summarize by sport family without over-specificity.`,
      geminiNote: "Common Ground keeps this panel generalized so fan discovery stays aggregate and privacy-aware.",
      sourceRefs: [sourceRef]
    };
  }

  const familyLabel = topFamilies.join(" + ");
  const sportLabel = topSports.length ? joinList(topSports) : "multiple public roster sport tags";
  return {
    program,
    label,
    sportFamily: familyLabel,
    aggregateSignal: signal,
    primarySportTag: topSports[0] || null,
    topSportTags: topSports,
    sportTagCandidates,
    geographyConnection: `${geographySnapshot} could help fans frame the state's ${programName} sport-family presence without implying geography causes outcomes.`,
    geminiNote: `Public roster tags in this panel include ${sportLabel}; the state context may suggest a fan discovery lens, not a performance claim.`,
    sourceRefs: [sourceRef]
  };
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
  if (/team|basketball|soccer|volleyball|rugby|field hockey|handball|baseball|softball|goalball|water polo/.test(text)) {
    tags.add("team");
    tags.add("spatial");
  }
  if (/precision|shooting|archery|fencing|table tennis|tennis|badminton|golf/.test(text)) {
    tags.add("precision");
    tags.add("focus");
    tags.add("control");
  }
  if (/balance|gymnastics|skateboarding|sport climbing|breaking|equestrian|surfing/.test(text)) {
    tags.add("balance");
    tags.add("technical");
    tags.add("control");
  }
  if (/power|boxing|wrestling|judo|taekwondo|powerlifting|weightlifting/.test(text)) {
    tags.add("power");
    tags.add("control");
  }
  if (/winter|skiing|biathlon|snow|ice/.test(text)) {
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
      name: "Waterline Control",
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
  if (geographyTags.includes("coastal") && tags.has("water")) return "Coastal Rhythm";
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
  if (/coastal|water/i.test(themeName)) return "Waterline Timing Challenge";
  if (/elevation|cold|pace/i.test(themeName)) return "Pace Control Challenge";
  if (/focus/i.test(themeName)) return "Focus Timing Challenge";
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
