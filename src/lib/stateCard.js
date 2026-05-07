import {
  SIGNAL_LABELS,
  CARD_THEME_LABELS,
  CARD_ART,
  FRAMED_CARD_PANEL_PROMPT_VERSIONS,
  CURRENT_CARD_BACK_COPY_VERSION,
  SUPPORTED_GAME_EXPERIENCE_VERSIONS,
  GAME_TYPE_LABELS,
  PANEL_QA_ROWS
} from "./constants.js";

const GAME_BACKGROUNDS_ENABLED = false;

export function titleBucket(bucket) {
  const normalized = String(bucket || "insufficient_data");
  return SIGNAL_LABELS[normalized] || normalized.replaceAll("_", " ");
}

export async function getJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

const ABSTRACT_TRAIT_NAMES = [
  "Waterline Control",
  "Waterline Rhythm",
  "Steady Pace Control",
  "Rhythm and Pace Control",
  "Coastal Rhythm",
  "Spatial Timing",
  "Focus and Precision",
  "Focus Timing",
  "Control Under Pressure"
];

const ABSTRACT_CARD_THEME_NAMES = [
  ...ABSTRACT_TRAIT_NAMES,
  "Cold Pace",
  "Elevation Pace",
  "Heat Control",
  "City Timing",
  "Focus Lines",
  "State Sync"
];

function generatedGameExperienceForCard(cardOrTrait) {
  return cardOrTrait?.gameExperience || cardOrTrait?.cardStory?.gameExperience || null;
}

function isAbstractTraitName(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return ABSTRACT_TRAIT_NAMES.some((name) => name.toLowerCase() === normalized);
}

function lowerFirst(value = "") {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : "";
}

function connectionTraitDescription(cardOrTrait) {
  return lowerFirst(plainTraitDescription(cardOrTrait))
    .replace(/[.!?]+$/, "")
    .replace(/^celebrate the ability to\s+/i, "the ability to ")
    .replace(/^celebrate the\s+/i, "the ");
}

export function plainTraitDescription(cardOrTrait) {
  const generated = generatedGameExperienceForCard(cardOrTrait);
  if (String(generated?.sharedTraitDescription || "").trim()) return String(generated.sharedTraitDescription).trim();
  const trait = cardOrTrait?.sharedTrait || cardOrTrait || {};
  return String(trait.description || "The featured sports share a similar mix of timing, control, and adaptation.").trim();
}

export function plainTraitHeadline(cardOrTrait) {
  const generated = generatedGameExperienceForCard(cardOrTrait);
  const generatedName = String(generated?.sharedTraitName || "").trim();
  if (generatedName && !isAbstractTraitName(generatedName)) return generatedName;
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

export function traitConnectionSentence(card, olympicCue = "the Olympic sport", paralympicCue = "the Paralympic sport") {
  const olympicExample = traitExampleForProgram(card, "olympic", olympicCue);
  const paralympicExample = traitExampleForProgram(card, "paralympic", paralympicCue);
  return `The shared trait is ${connectionTraitDescription(card)}. For ${olympicCue}, that can mean ${olympicExample}; for ${paralympicCue}, it can mean ${paralympicExample}.`;
}

function traitExampleForProgram(card, program, visualCue) {
  const generated = generatedGameExperienceForCard(card);
  const generatedExamples = generated?.sharedTraitExamples || {};
  const generatedExample = generatedExamples[program] || generated?.[`${program}TraitExample`];
  if (String(generatedExample || "").trim()) {
    return normalizeExamplePhrase(generatedExample);
  }
  return sportTraitExample(visualCue, card?.[`${program}Panel`]);
}

function normalizeExamplePhrase(value) {
  return lowerFirst(value)
    .replace(/[.!?]+$/, "")
    .replace(/^(it can show up as|that can show up as|showing|through)\s+/i, "")
    .trim();
}

export function sportTraitExample(visualCue, panel) {
  const sport = String(visualCue || "").toLowerCase();
  const family = String(panel?.sportFamily || "").toLowerCase();
  if (!hasSpecificSportCue(panel)) {
    return "comparing the available sport-family context";
  }
  if (/water polo/.test(sport)) {
    return "reading passing lanes and resetting spacing while players tread water";
  }
  if (/triathlon/.test(sport)) {
    return "switching rhythm across swim, bike, run, and transition moments";
  }
  if (/snowboard/.test(sport)) {
    return "using edge control, line choice, and landing timing on changing snow";
  }
  if (/alpine ski|skiing/.test(sport)) {
    return "linking turns while managing speed, gates, and equipment";
  }
  if (/swimming|surfing|sailing|rowing|canoe/.test(sport) || /aquatic|water/.test(family)) {
    return "holding body position and rhythm while the water keeps changing";
  }
  if (/track|cycling|marathon|race walk/.test(sport) || /endurance|pace/.test(family)) {
    return "adjusting pace and cadence as the race conditions shift";
  }
  if (/shooting|archery|fencing|golf|tennis|table tennis|badminton/.test(sport) || /precision|focus/.test(family)) {
    return "holding focus through setup, timing, and a short decision window";
  }
  if (/basketball|soccer|volleyball|rugby|goalball|hockey|handball|baseball|softball/.test(sport) || /team|spatial/.test(family)) {
    return "reading space, timing passes, and resetting shape under pressure";
  }
  if (/skateboarding|gymnastics|climbing|equestrian|breaking/.test(sport) || /balance|technical/.test(family)) {
    return "using balance, line choice, and timing through each sequence";
  }
  return "turning timing, movement, and decisions into something fans can watch for";
}

export function sanitizeTraitJargon(value, replacement = "the connection") {
  let text = String(value || "");
  for (const name of ABSTRACT_TRAIT_NAMES) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text
      .replace(new RegExp(`connects to ${escaped} through`, "gi"), "connects through")
      .replace(new RegExp(`links to ${escaped} through`, "gi"), "links through")
      .replace(new RegExp(`read ${escaped} through`, "gi"), "notice the connection through")
      .replace(new RegExp(escaped, "g"), replacement);
  }
  return text;
}

export function fallbackBriefing(card, reason = "The Gemini backend is not available from this dev server.") {
  const olympicCue = getPanelVisualCue(card.olympicPanel);
  const paralympicCue = getPanelVisualCue(card.paralympicPanel);
  const geography = getGeographySignals(card).length ? joinReadableList(getGeographySignals(card)) : card.geographySnapshot;
  return {
    source: "react-fallback",
    model: "safe-fallback",
    briefing: {
      stateSnapshot: `In the public aggregate Team USA state data, ${card.stateName} shows Olympic and Paralympic sport lists from the ${datasetLabelForCard(card)}, with featured card examples from ${olympicCue} and ${paralympicCue}. That does not mean geography causes outcomes; it gives fans a safer way to explore why different sport environments appear in one state view.`,
      sportMix: [
        {
          theme: "Olympic sports",
          detail: sportMixPreviewDetail(card, card.olympicPanel, "Olympic")
        },
      {
        theme: "Paralympic sports",
        detail: sportMixPreviewDetail(card, card.paralympicPanel, "Paralympic")
      }
    ],
      geographyLens: `${card.geographySnapshot} could help fans understand why varied sport environments appear in this aggregate state view.`,
      hometownAreas: formatHometownAreas(card.topHometownSignals),
      whatToNotice: "The useful fan read is contrast: some sports emphasize spacing and quick decisions, while others emphasize rhythm, stillness, pacing, equipment, or transitions.",
      surprisingConnection: `${olympicCue} and ${paralympicCue} do not need to look alike to share a viewing idea; both can point fans toward control when timing, surface, or spacing changes.`,
      sharedStateSignal: traitConnectionSentence(card, olympicCue, paralympicCue),
      gameIntro: `Try a short fan challenge inspired by ${lowerFirst(plainTraitHeadline(card))}.`,
      complianceWarnings: [reason]
    },
    complianceWarnings: [reason]
  };
}

export function formatHometownAreas(signals = []) {
  return (signals || []).slice(0, 3).map((area) => ({
    area: area.label,
    detail: formatHometownAreaDetail(area)
  }));
}

export function fallbackGameReflection(card, result, reason = "The Gemini backend is not available from this dev server.") {
  return {
    reflection: `${result.summary} That could help you appreciate how ${lowerFirst(plainTraitDescription(card))} can matter across several sport families. This is a fan challenge only and does not measure ability or compare you with anyone.`,
    model: "safe-fallback",
    warnings: [reason]
  };
}

export function uniqueSourceRefs(refs) {
  const seen = new Set();
  return refs.filter((ref) => {
    const key = `${ref.label}-${ref.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function formatExcludedRows(rows = {}) {
  const entries = Object.entries(rows);
  if (!entries.length) return "none";
  return entries.map(([key, value]) => `${key}: ${value}`).join(", ");
}

export function getRosterCounts(card) {
  return card?.hometownRosterCounts || { olympic: 0, paralympic: 0, total: 0 };
}

export function formatMapHint(card) {
  const counts = getRosterCounts(card);
  return `${card.stateName}: ${counts.olympic} Olympic athletes, ${counts.paralympic} Paralympic athletes, ${counts.total} total public Team USA athletes.`;
}

export function getCardStory(card) {
  return card?.cardStory || {
    themeName: plainTraitHeadline(card) || getCardThemeLabel(card),
    geographySignal: card?.terrainSignals || [],
    olympicFeatured: {
      sportTag: card?.olympicPanel?.primarySportTag || getPanelVisualCue(card?.olympicPanel),
      sportFamily: card?.olympicPanel?.sportFamily
    },
    paralympicFeatured: {
      sportTag: card?.paralympicPanel?.primarySportTag || getPanelVisualCue(card?.paralympicPanel),
      sportFamily: card?.paralympicPanel?.sportFamily
    },
    sharedTrait: card?.sharedTrait,
    fanChallengeName: "Fan Challenge"
  };
}

export function getGeographySignals(card) {
  const storySignals = getCardStory(card).geographySignal || [];
  const signals = storySignals.length ? storySignals : card.terrainSignals || [];
  return signals.filter(Boolean).slice(0, 5);
}

export function getCardThemeName(card) {
  const themeName = String(getCardStory(card).themeName || "").trim();
  const isAbstractThemeName = ABSTRACT_CARD_THEME_NAMES.some((name) => name.toLowerCase() === themeName.toLowerCase());
  return !themeName || isAbstractThemeName ? (plainTraitHeadline(card) || getCardThemeLabel(card)) : themeName;
}

export function getCardTheme(card) {
  const counts = getRosterCounts(card);
  const text = `${card.olympicPanel.sportFamily} ${card.paralympicPanel.sportFamily} ${card.sharedTrait.name} ${card.sharedTrait.description}`;
  if (!counts.total || card.hometownPresenceBucket === "insufficient_data") return "neutral";
  if (/aquatic|water|surf|sail|swimming|coast|ocean/i.test(text)) return "aquatic";
  if (/winter|snow|mountain|endurance|pace/i.test(text)) return "winter-endurance";
  if (/precision|team|spatial|focus/i.test(text)) return "spatial-timing";
  if (/balance|power|pressure|contact|mixed|control/i.test(text)) return "control-pressure";
  return "rhythm-pace";
}

export function getCardThemeLabel(card) {
  return CARD_THEME_LABELS[getCardTheme(card)] || CARD_THEME_LABELS.neutral;
}

export function shortProgramName(program) {
  return program === "paralympic" ? "Paralympic" : "Olympic";
}

export function joinReadableList(items = []) {
  const values = items.filter(Boolean);
  if (values.length <= 1) return values[0] || "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

export function displaySportName(value) {
  const text = String(value || "").trim();
  if (/^paratriathlon$/i.test(text)) return "Para triathlon";
  return text;
}

export function panelSportList(panel) {
  const sports = panel?.allSportTags?.length ? panel.allSportTags : panel?.topSportTags;
  return (sports || []).map(displaySportName);
}

export function panelFeaturedSportList(panel, limit = 3) {
  const sports = panel?.topSportTags?.length ? panel.topSportTags : panelSportList(panel);
  return (sports || []).slice(0, limit).map(displaySportName);
}

export function datasetLabelForCard(card) {
  const scopeId = card?.dataScopeId || "both";
  if (scopeId === "paris2024") return "Paris 2024 dataset";
  if (scopeId === "milanoCortina2026") return "Milano Cortina 2026 dataset";
  if (scopeId === "both") return "combined Paris 2024 and Milano Cortina 2026 dataset";
  return "selected Team USA dataset";
}

export function sportMixPreviewDetail(card, panel, programLabel) {
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

export function hasSpecificSportCue(panel) {
  return Boolean(panel?.primarySportTag || panel?.topSportTags?.[0]);
}

function panelAthleteCount(panel) {
  const count = Number(panel?.sourceAthleteCount);
  return Number.isFinite(count) ? count : null;
}

function athleteCountLabel(count) {
  if (!Number.isFinite(Number(count))) return "public athletes";
  return `${count} public athlete${Number(count) === 1 ? "" : "s"}`;
}

function sportFamilySignalName(panel) {
  const family = String(panel?.sportFamily || "").toLowerCase();
  if (/no sourced|insufficient/.test(family)) return "";
  if (/winter|ski|snow|ice|equipment/.test(family)) return "Winter equipment signal";
  if (/aquatic|water/.test(family)) return "Water sport signal";
  if (/team|spatial/.test(family)) return "Team sport signal";
  if (/balance|technical/.test(family)) return "Technical control signal";
  if (/precision|focus/.test(family)) return "Focus signal";
  if (/power|contact/.test(family)) return "Power control signal";
  if (/endurance|pace/.test(family)) return "Pace endurance signal";
  if (/mixed/.test(family)) return "Mixed sport signal";
  return "";
}

function panelFallbackCue(panel) {
  const programName = shortProgramName(panel?.program);
  if (panel?.aggregateSignal === "insufficient_data" || /^no sourced/i.test(panel?.sportFamily || "")) {
    return `No sourced ${programName} signal`;
  }
  const familySignal = sportFamilySignalName(panel);
  if (familySignal) return familySignal;
  const count = panelAthleteCount(panel);
  if (Number.isFinite(count) && count > 0) {
    return `${count} ${programName} athlete${count === 1 ? "" : "s"} signal`;
  }
  return `Limited ${programName} signal`;
}

export function getPanelVisualCue(panel) {
  return displaySportName(panel?.primarySportTag || panel?.topSportTags?.[0] || panelFallbackCue(panel));
}

export function panelProgramLabel(panel) {
  return panel?.primarySportTag
    ? `${shortProgramName(panel.program)} featured sport`
    : `${shortProgramName(panel.program)} sport-family`;
}

export function featuredSportsIntro(card) {
  const olympicCue = getPanelVisualCue(card?.olympicPanel);
  const paralympicCue = getPanelVisualCue(card?.paralympicPanel);
  const stateName = card?.stateName || "this state";

  if (!hasSpecificSportCue(card?.olympicPanel) || !hasSpecificSportCue(card?.paralympicPanel)) {
    return `The Olympic and Paralympic lenses stay visible for ${stateName}. If public athletes exist on a side, the card shows the available sport cue; otherwise it keeps that side as source context.`;
  }

  return `${olympicCue} and ${paralympicCue} are the featured Olympic and Paralympic sport lenses for ${stateName}. The notes below explain how each sport works and how ${stateName}'s geography connects to the state story.`;
}

export function getPanelTopSportText(panel) {
  if (panel?.aggregateSignal === "insufficient_data") return `No sourced public ${shortProgramName(panel?.program)} athlete signal is available for this state.`;
  const count = panelAthleteCount(panel);
  const familySignal = sportFamilySignalName(panel);
  const signalPrefix = familySignal ? `${familySignal} is present from ` : "";
  return `${signalPrefix}${athleteCountLabel(count)}. This low-volume sport cue is shown as state context, not an athlete-level claim.`;
}

export function panelThemePhrase(panel) {
  const family = String(panel?.sportFamily || "").toLowerCase();
  if (/winter|equipment/.test(family)) return "winter-equipment sport";
  if (/aquatic|water/.test(family) && /team|spatial/.test(family)) return "aquatic team-sport";
  if (/aquatic|water/.test(family)) return "water-sport";
  if (/endurance|pace/.test(family) && /team|spatial/.test(family)) return "pace-and-spatial sport";
  if (/endurance|pace/.test(family)) return "pace-control sport";
  if (/precision|focus/.test(family)) return "precision-sport";
  if (/team|spatial/.test(family)) return "team-and-space sport";
  if (/balance|technical/.test(family)) return "technical-control sport";
  if (/power|contact/.test(family)) return "power-and-control sport";
  return "sport-family";
}

export function readableGeographyLens(panel, visualCue) {
  const raw = String(panel?.geographyConnection || "").trim();
  const geography = raw
    .replace(/\s+could help fans frame the state's .*? sport-family presence without implying geography causes outcomes\.$/i, "")
    .trim();
  if (geography && geography !== raw) {
    return `${geography} could show how regional geography may offer useful context for ${visualCue}'s ${panelThemePhrase(panel)} qualities.`;
  }
  return raw || getPanelTopSportText(panel);
}

export function watchLensForSport(visualCue, panel) {
  const sport = String(visualCue || "").toLowerCase();
  const family = String(panel?.sportFamily || "").toLowerCase();
  if (/water polo/.test(sport)) {
    return "Look for fast decisions in crowded water: passing lanes, defensive resets, and how teams create space without stable footing.";
  }
  if (/triathlon/.test(sport)) {
    return "Watch the pacing across stages and transitions, where control has to carry from water to road to run.";
  }
  if (/swimming/.test(sport)) {
    return "Notice tempo, lane awareness, and how a steady stroke rhythm turns water movement into repeatable control.";
  }
  if (/track|cycling|rowing|canoe|marathon|race walk/.test(sport) || /endurance|pace/.test(family)) {
    return "Watch how pace changes over time: starts, surges, recovery moments, and steady control under pressure.";
  }
  if (/shooting|archery|fencing|golf|tennis|table tennis|badminton/.test(sport) || /precision|focus/.test(family)) {
    return "Look for quiet control: setup, timing, focus, and clean decisions in short windows.";
  }
  if (/basketball|soccer|volleyball|rugby|goalball|hockey|handball|baseball|softball/.test(sport) || /team|spatial/.test(family)) {
    return "Watch spacing and rhythm: how movement opens lanes, resets pressure, and turns timing into team shape.";
  }
  if (/skateboarding|gymnastics|climbing|surfing|equestrian|breaking/.test(sport) || /balance|technical/.test(family)) {
    return "Notice balance, line choice, and how small timing changes shape the whole movement sequence.";
  }
  return `Watch how ${visualCue} turns movement, timing, and decisions into a readable sport story for fans.`;
}

export function fanTakeawayForSport(visualCue, panel, sharedTraitName = "") {
  const sport = String(visualCue || "").toLowerCase();
  if (!hasSpecificSportCue(panel)) {
    return `${shortProgramName(panel?.program)} context stays visible here even when no specific sport cue is available.`;
  }
  if (/water polo/.test(sport)) {
    return "This panel is about rhythm under pressure: players are constantly reading space, coordinating, and moving through resistance.";
  }
  if (/triathlon/.test(sport)) {
    return "This panel extends the waterline idea into endurance: pacing, transitions, and control across changing environments.";
  }
  if (/swimming|surfing|sailing|rowing|canoe/.test(sport)) {
    return "This panel keeps the card close to water movement: rhythm, balance, and control while conditions shift.";
  }
  return `${visualCue} helps fans notice ${sharedTraitName || panel?.sportFamily || "the connection"} through a specific sport instead of an abstract data label.`;
}

export function subtitleForSport(visualCue, panel) {
  const sport = String(visualCue || "").toLowerCase();
  if (!hasSpecificSportCue(panel)) return panel?.aggregateSignal === "insufficient_data" ? "No sourced hometown signal" : "Low-volume public athlete signal";
  if (/water polo/.test(sport)) return "Aquatic team sport · goals in net · possession pressure";
  if (/triathlon/.test(sport)) return "Swim · bike · run · transition control";
  if (/swimming/.test(sport)) return "Water rhythm · lane tempo · repeatable control";
  if (/track/.test(sport)) return "Pace changes · clean starts · sustained control";
  if (/cycling/.test(sport)) return "Road rhythm · equipment control · outdoor pace";
  if (/shooting|archery/.test(sport)) return "Quiet setup · focus line · repeat control";
  return String(panel?.sportFamily || "Sport-family story").replaceAll(" / ", " · ");
}

export function factChipsForSport(visualCue, panel) {
  const sport = String(visualCue || "").toLowerCase();
  if (!hasSpecificSportCue(panel)) {
    return panel?.aggregateSignal === "insufficient_data"
      ? ["No sourced signal", "Parity panel visible"]
      : [athleteCountLabel(panelAthleteCount(panel)), "Low-volume cue"];
  }
  if (/water polo/.test(sport)) return ["7 per team: 6 field + goalkeeper", "4 quarters", "Possession pressure", "One-hand control"];
  if (/triathlon/.test(sport)) return ["Swim segment", "Bike segment", "Run segment", "Transition control"];
  if (/swimming/.test(sport)) return ["Water rhythm", "Lane tempo", "Body position", "Repeat control"];
  if (/track/.test(sport)) return ["Pace shifts", "Start timing", "Lane awareness", "Sustained rhythm"];
  if (/cycling/.test(sport)) return ["Road movement", "Equipment rhythm", "Pacing choices", "Terrain changes"];
  return String(panel?.sportFamily || "Sport-family theme")
    .split(/\s*[+/·]\s*|\s+\/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}

export function moduleMixForSport(visualCue, panel) {
  const sport = String(visualCue || "").toLowerCase();
  const family = String(panel?.sportFamily || "").toLowerCase();
  if (/water polo/.test(sport)) return ["Hidden Skill", "State Culture", "Watch Hook"];
  if (/triathlon/.test(sport)) return ["Pace Shift", "Gear/Setup", "Broadcast Moment"];
  if (/skateboarding|gymnastics|climbing|surfing|equestrian|breaking/.test(sport)) return ["Hidden Skill", "Terrain/Environment Lens", "Watch Hook"];
  if (/cycling/.test(sport)) return ["Gear/Setup", "Pace Shift", "Terrain/Environment Lens"];
  if (/shooting|archery/.test(sport) || /precision|focus/.test(family)) return ["Hidden Skill", "Rules Snapshot", "Watch Hook"];
  return ["Watch Hook", "Sport Family Link", "Challenge Link"];
}

export function qaFactsForSport(visualCue, panel) {
  const sport = String(visualCue || "").toLowerCase();
  const stateConnection = readableGeographyLens(panel, visualCue);
  if (!hasSpecificSportCue(panel)) {
    return {
      howItWorks: getPanelTopSportText(panel),
      watchValue: `Use this ${shortProgramName(panel?.program)} lens as source context, not as a featured-sport claim.`,
      stateConnection,
      cardTrait: fanTakeawayForSport(visualCue, panel)
    };
  }
  if (/water polo/.test(sport)) {
    return {
      howItWorks: "Two teams of seven play in the water: six field players plus one goalkeeper. The goal is to throw the ball into the opponent's net, so each attack has to create space, pass, and shoot before the chance disappears.",
      watchValue: "Water polo gets easier to read when you watch the spacing before the shot. The drama is that every pass, fake, and goal attempt happens while players are swimming or treading water.",
      stateConnection,
      cardTrait: "Water polo connects through spacing, body position, and quick rhythm changes in a pool where no one has stable footing."
    };
  }
  if (/triathlon/.test(sport)) {
    return {
      howItWorks: "Para triathlon is a race across swim, bike, and run stages. The competitor with the fastest total race time in their event wins, and transition time between stages matters too.",
      watchValue: "The race keeps changing shape as water gives way to equipment setup, bike rhythm, and another reset for the run.",
      stateConnection,
      cardTrait: "Para triathlon connects through pacing and adaptation across changing surfaces."
    };
  }
  return {
    howItWorks: `${visualCue} sits inside the card's ${panelThemePhrase(panel)} theme.`,
    watchValue: watchLensForSport(visualCue, panel),
    stateConnection,
    cardTrait: fanTakeawayForSport(visualCue, panel)
  };
}

export function getPanelBackCopy(panel) {
  const visualCue = getPanelVisualCue(panel);

  if (panel.cardBackCopy?.qaFacts) return panel.cardBackCopy;

  return {
    featuredCue: visualCue,
    moduleMix: moduleMixForSport(visualCue, panel),
    subtitle: subtitleForSport(visualCue, panel),
    qaFacts: qaFactsForSport(visualCue, panel),
    factChips: factChipsForSport(visualCue, panel)
  };
}

export function getPanelBackCopyForDisplay(panel) {
  if (panel?.cardBackCopyVersion === CURRENT_CARD_BACK_COPY_VERSION && panel?.cardBackCopy) {
    return {
      ...panel.cardBackCopy,
      qaFacts: {
        ...panel.cardBackCopy.qaFacts,
        cardTrait: sanitizeTraitJargon(panel.cardBackCopy.qaFacts?.cardTrait, "the card connection")
      }
    };
  }
  const fallback = getPanelBackCopy(panel);
  const legacy = panel?.cardBackCopy || {};
  const legacyQa = legacy.qaFacts || {};
  const legacyQaFacts = legacyQa && Object.keys(legacyQa).length
    ? {
      howItWorks: legacyQa.howItWorks || legacyQa.aboutSport,
      watchValue: legacyQa.watchValue,
      stateConnection: legacyQa.stateConnection,
      cardTrait: legacyQa.cardTrait || legacyQa.eventRhythm || legacyQa.funFact
    }
    : fallback.qaFacts;
  const qaFacts = {
    ...legacyQaFacts,
    cardTrait: sanitizeTraitJargon(legacyQaFacts.cardTrait, "the card connection")
  };
  return {
    ...fallback,
    featuredCue: displaySportName(legacy.featuredCue || fallback.featuredCue),
    moduleMix: Array.isArray(legacy.moduleMix) && legacy.moduleMix.length ? legacy.moduleMix : fallback.moduleMix,
    subtitle: legacy.subtitle || legacy.sportFamilyTheme || fallback.subtitle,
    qaFacts,
    factChips: Array.isArray(legacy.factChips) && legacy.factChips.length ? legacy.factChips : fallback.factChips,
  };
}

function normalizedSportTag(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function generatedPanelMatchesCardProgram(card, program, generatedPanel) {
  const currentSport = normalizedSportTag(card?.[`${program}Panel`]?.primarySportTag);
  const generatedSport = normalizedSportTag(generatedPanel?.primarySportTag);
  return Boolean(currentSport && generatedSport && currentSport === generatedSport);
}

function statePanelEntryForCard(card, manifest) {
  return manifest?.states?.[card?.stateCode] || {};
}

function generatedPanelCandidates(card, program, manifest) {
  const stateEntry = statePanelEntryForCard(card, manifest);
  const scopeId = card?.dataScopeId || "both";
  const exactScopePanel = stateEntry.scopes?.[scopeId]?.[program];
  const legacyPanel = stateEntry[program];
  const otherScopePanels = Object.entries(stateEntry.scopes || {})
    .filter(([candidateScopeId]) => candidateScopeId !== scopeId)
    .map(([, scopeEntry]) => scopeEntry?.[program])
    .filter(Boolean);
  return [exactScopePanel, legacyPanel, ...otherScopePanels].filter(Boolean);
}

function getGeneratedPanelForCardProgram(card, program, manifest) {
  return generatedPanelCandidates(card, program, manifest).find((panel) =>
    generatedPanelMatchesCardProgram(card, program, panel)
  ) || null;
}

function generatedGameExperienceSourceForCard(card, manifest) {
  const stateEntry = statePanelEntryForCard(card, manifest);
  const scopeId = card?.dataScopeId || "both";
  const exactScopeEntry = stateEntry.scopes?.[scopeId];
  if (exactScopeEntry?.gameExperience || exactScopeEntry?.game) return exactScopeEntry;
  if (scopeId === "both") return stateEntry.scopes?.both?.gameExperience || stateEntry.scopes?.both?.game
    ? stateEntry.scopes.both
    : stateEntry;
  return {};
}

export function getPanelArtUrl(card, program, manifest) {
  const panel = getGeneratedPanelForCardProgram(card, program, manifest);
  if (
    panel?.url &&
    !FRAMED_CARD_PANEL_PROMPT_VERSIONS.has(panel.promptVersion)
  ) {
    return panel.url;
  }
  const theme = getCardTheme(card);
  return CARD_ART[theme] || CARD_ART.neutral;
}

export function getGeneratedGameExperience(statePanels = {}) {
  const experience = statePanels.gameExperience || statePanels.game;
  if (!experience || !SUPPORTED_GAME_EXPERIENCE_VERSIONS.has(experience.version)) return null;
  if (!GAME_TYPE_LABELS[experience.challengeType]) return null;
  return experience;
}

export function mergeGeneratedPanelData(card, manifest) {
  const statePanels = statePanelEntryForCard(card, manifest);
  const scopedGameExperienceSource = generatedGameExperienceSourceForCard(card, manifest);
  if (!card || (!statePanels.olympic && !statePanels.paralympic && !statePanels.scopes && !statePanels.gameExperience && !statePanels.game)) return card;
  const matchingPanels = {
    olympic: getGeneratedPanelForCardProgram(card, "olympic", manifest),
    paralympic: getGeneratedPanelForCardProgram(card, "paralympic", manifest)
  };
  const gameExperience = getGeneratedGameExperience(scopedGameExperienceSource);

  function mergePanel(program, panel) {
    const generated = matchingPanels[program] || {};
    const hasCurrentCardCopy = generated.cardBackCopyVersion === CURRENT_CARD_BACK_COPY_VERSION && generated.cardBackCopy;
    return {
      ...panel,
      cardBackCopy: hasCurrentCardCopy ? generated.cardBackCopy : panel.cardBackCopy,
      cardBackCopySource: hasCurrentCardCopy ? generated.cardBackCopySource : panel.cardBackCopySource,
      cardBackCopyModel: hasCurrentCardCopy ? generated.cardBackCopyModel : panel.cardBackCopyModel,
      cardBackCopyVersion: hasCurrentCardCopy ? generated.cardBackCopyVersion : panel.cardBackCopyVersion
    };
  }

  return {
    ...card,
    sharedTrait: gameExperience
      ? {
        ...card.sharedTrait,
        name: gameExperience.sharedTraitName || card.sharedTrait.name,
        description: gameExperience.sharedTraitDescription || card.sharedTrait.description,
        challengeType: gameExperience.challengeType
      }
      : card.sharedTrait,
    cardStory: {
      ...card.cardStory,
      gameExperience: gameExperience || card.cardStory?.gameExperience,
      fanChallengeName: gameExperience?.gameName || card.cardStory?.fanChallengeName
    },
    gameExperience: gameExperience || card.gameExperience,
    olympicPanel: mergePanel("olympic", card.olympicPanel),
    paralympicPanel: mergePanel("paralympic", card.paralympicPanel)
  };
}

export function getGameExperience(card) {
  const generated = generatedGameExperienceForCard(card);
  const challengeType = generated?.challengeType || card.sharedTrait?.challengeType || "reaction_grid";
  const generatedGameName = String(generated?.gameName || card.cardStory?.fanChallengeName || "").trim();
  const gameName = challengeType === "cadence_keeper"
    ? "Rhythm Shift Challenge"
    : generatedGameName || `${GAME_TYPE_LABELS[challengeType] || "State Sync"} Challenge`;
  return {
    version: generated?.version,
    source: generated?.source || "deterministic-fallback",
    challengeType,
    gameName,
    gameIntro: challengeType === "cadence_keeper"
      ? "Tap through 1s, 1.5s, and 2s counts and see how steady your personal rhythm stays."
      : generated?.gameIntro,
    sharedTraitName: plainTraitHeadline(card),
    sharedTraitDescription: generated?.sharedTraitDescription || card.sharedTrait?.description,
    background: generated?.background || null,
    theme: generated?.theme || null
  };
}

function gameBackgroundUrl(gameExperience) {
  return gameExperience?.background?.url || gameExperience?.backgroundUrl;
}

export function gameBoardStyle(gameExperience) {
  const url = gameBackgroundUrl(gameExperience);
  return GAME_BACKGROUNDS_ENABLED && url ? { "--game-bg-image": `url("${url}")` } : undefined;
}

export function gameBoardClass(baseClass, gameExperience) {
  const hasBackground = GAME_BACKGROUNDS_ENABLED && Boolean(gameBackgroundUrl(gameExperience));
  return `game-board ${baseClass} ${hasBackground ? "has-game-background" : ""}`;
}

export function briefingSections(briefing = {}) {
  if (briefing.stateSnapshot || briefing.whatToNotice || briefing.sharedStateSignal) {
    return [
      ["State Snapshot", briefing.stateSnapshot],
      ["Sport Mix", briefing.sportMix],
      ["Geography Lens", briefing.geographyLens],
      ["What To Notice", briefing.whatToNotice],
      ["Surprising Connection", briefing.surprisingConnection]
    ].filter(([, value]) => Array.isArray(value) ? value.length : String(value || "").trim());
  }

  if (briefing.stateScene || briefing.sportMix || briefing.whyInteresting) {
    return [
      ["State Snapshot", briefing.stateScene],
      ["Sport Mix", [briefing.sportMix?.olympic, briefing.sportMix?.paralympic].filter(Boolean)],
      ["Geography Lens", briefing.geographyLens],
      ["What To Notice", briefing.whyInteresting],
      ["Surprising Connection", briefing.surprisingConnection]
    ].filter(([, value]) => Array.isArray(value) ? value.length : String(value || "").trim());
  }

  return [
    ["State Snapshot", briefing.summary],
    ["Sport Mix", [
      briefing.olympicNarrative ? `Olympic side: ${briefing.olympicNarrative}` : "",
      briefing.paralympicNarrative ? `Paralympic side: ${briefing.paralympicNarrative}` : ""
    ].filter(Boolean)]
  ].filter(([, value]) => Array.isArray(value) ? value.length : String(value || "").trim());
}

export function compactSentences(value, maxSentences = 2) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((item) => item.trim()).filter(Boolean) || [text];
  return sentences.slice(0, maxSentences).join(" ");
}

export function compactSnippet(value, maxLength = 205) {
  const text = compactSentences(value, 1);
  if (text.length <= maxLength) return text;
  const trimmed = trimDanglingSnippetEnding(text.slice(0, maxLength).replace(/\s+\S*$/, ""));
  const snippet = trimmed || text.slice(0, maxLength).trim();
  return /[.!?]$/.test(snippet) ? snippet : `${snippet}.`;
}

function trimDanglingSnippetEnding(value) {
  let text = String(value || "").trim().replace(/[,:;]+$/, "");
  const danglingEnding = /\b(?:a|an|the|and|or|of|for|to|with|by|in|on|at|from|why|how|that|this|these|those|their|its|could|may|can|help|helps|helping|fans|understand|explain|explore|read|show|connect|suggest|because)$/i;
  while (danglingEnding.test(text)) {
    text = text.replace(/\s+\S+$/i, "").trim().replace(/[,:;]+$/, "");
  }
  return text;
}

export function compactPanelCopy(panel) {
  const copy = getPanelBackCopyForDisplay(panel);
  const visualCue = copy.featuredCue || getPanelVisualCue(panel);
  const factChips = Array.isArray(copy.factChips) ? copy.factChips.filter(Boolean).slice(0, 2) : [];
  return {
    visualCue,
    summary: compactSnippet(copy.qaFacts?.howItWorks || copy.qaFacts?.watchValue || panel.geographyConnection),
    chips: factChips
  };
}

export function compactStateConnection(card, briefing) {
  const snapshotSignals = String(card?.geographySnapshot || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const signals = snapshotSignals.length ? snapshotSignals : getGeographySignals(card);
  const featuredSignals = signals.length > 3 ? [signals[0], signals[1], signals.at(-1)] : signals.slice(0, 3);
  const readableGeography = joinReadableList(featuredSignals.map(sentenceCaseGeographySignal)) || card.geographySnapshot || "geography";
  return compactSnippet(`${possessiveStateName(card.stateName)} ${readableGeography} could help fans understand why varied sport environments appear in this state.`, 165);
}

function possessiveStateName(stateName) {
  const name = String(stateName || "This state").trim();
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

function sentenceCaseGeographySignal(value, index) {
  const text = String(value || "").trim();
  if (!text || index !== 0) return text;
  const firstWord = text.split(/\s+/)[0].replace(/[^A-Za-z.]/g, "");
  const properOpeners = new Set([
    "Pacific",
    "Atlantic",
    "Gulf",
    "Great",
    "Blue",
    "Rocky",
    "Green",
    "Appalachian",
    "Ozark",
    "Ouachita",
    "Wasatch",
    "Chesapeake",
    "Puget",
    "Mississippi",
    "Midwest",
    "Northeast"
  ]);
  if (properOpeners.has(firstWord)) return text;
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

export function formatHometownAreaDetail(area = {}) {
  const total = Number(area.total);
  const olympic = Number(area.olympic);
  const paralympic = Number(area.paralympic);
  const label = String(area.label || area.area || "").trim();
  const hometownPhrase = label ? ` list ${label} as their hometown` : "";
  if (Number.isFinite(total) && Number.isFinite(olympic) && Number.isFinite(paralympic)) {
    return `${total} public Team USA athletes${hometownPhrase} (${olympic} Olympic-side, ${paralympic} Paralympic-side).`;
  }
  return "Public aggregate Team USA athlete hometown area in the source view.";
}

export function normalizeHometownAreaRows(card, briefing = {}) {
  const sourceRows = Array.isArray(card?.hometownAreaSignals) && card.hometownAreaSignals.length
    ? card.hometownAreaSignals
    : Array.isArray(card?.allHometownSignals) && card.allHometownSignals.length
      ? card.allHometownSignals
      : Array.isArray(card?.topHometownSignals)
        ? card.topHometownSignals
        : [];

  const rows = sourceRows
    .map((area, index) => normalizeHometownAreaRow(area, index))
    .filter(Boolean);

  if (rows.length) return rows;

  return (Array.isArray(briefing?.hometownAreas) ? briefing.hometownAreas : [])
    .map((area, index) => normalizeHometownAreaRow(area, index))
    .filter(Boolean);
}

export function normalizeHometownAreaRow(area, index) {
  if (!area || typeof area !== "object") return null;
  const label = String(area.label || area.area || area.city || "").trim();
  if (!label) return null;
  const total = Number.isFinite(Number(area.total)) ? Number(area.total) : null;
  const olympic = Number.isFinite(Number(area.olympic)) ? Number(area.olympic) : null;
  const paralympic = Number.isFinite(Number(area.paralympic)) ? Number(area.paralympic) : null;
  const countLabel = area.countLabel || "public athletes";
  const detail = area.detail || formatHometownAreaDetail({ label, total, olympic, paralympic, countLabel });

  return {
    rank: area.rank || index + 1,
    label,
    total,
    olympic,
    paralympic,
    countLabel,
    detail
  };
}
