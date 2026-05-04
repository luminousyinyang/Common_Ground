import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { geoContains, geoMercator, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import "./styles.css";

const FIPS_TO_CODE = {
  "01": "AL",
  "02": "AK",
  "04": "AZ",
  "05": "AR",
  "06": "CA",
  "08": "CO",
  "09": "CT",
  "10": "DE",
  "11": "DC",
  "12": "FL",
  "13": "GA",
  "15": "HI",
  "16": "ID",
  "17": "IL",
  "18": "IN",
  "19": "IA",
  "20": "KS",
  "21": "KY",
  "22": "LA",
  "23": "ME",
  "24": "MD",
  "25": "MA",
  "26": "MI",
  "27": "MN",
  "28": "MS",
  "29": "MO",
  "30": "MT",
  "31": "NE",
  "32": "NV",
  "33": "NH",
  "34": "NJ",
  "35": "NM",
  "36": "NY",
  "37": "NC",
  "38": "ND",
  "39": "OH",
  "40": "OK",
  "41": "OR",
  "42": "PA",
  "44": "RI",
  "45": "SC",
  "46": "SD",
  "47": "TN",
  "48": "TX",
  "49": "UT",
  "50": "VT",
  "51": "VA",
  "53": "WA",
  "54": "WV",
  "55": "WI",
  "56": "WY",
  "78": "VI"
};

const VIEW_LABELS = {
  explorer: "Map Explorer",
  collection: "My Sport Cards",
  challenge: "Trait Challenge",
  methodology: "Methodology"
};

const ACTIVE_VISUAL_THEME = {
  color: "midnight-sand",
  surface: "blacktop",
  type: "scoreboard"
};

const CARD_OPEN_PRESETS = [
  { id: "snap-deal", label: "Snap Deal" },
  { id: "pack-rip", label: "Pack Rip" },
  { id: "vault-flip", label: "Vault Flip" },
  { id: "table-drop", label: "Table Drop" },
  { id: "spotlight-bloom", label: "Spotlight" },
  { id: "slide-pick", label: "Slide Pick" },
  { id: "binder-lift", label: "Binder Lift" },
  { id: "case-pop", label: "Case Pop" },
  { id: "shuffle-fan", label: "Shuffle Fan" },
  { id: "still", label: "Still" }
];

const CARD_INTERACTION_PRESETS = [
  { id: "static-hold", label: "Static Hold" },
  { id: "tilt-inspect", label: "Tilt Inspect" },
  { id: "hover-float", label: "Hover Float" },
  { id: "foil-sweep", label: "Foil Sweep" },
  { id: "edge-glow", label: "Edge Glow" },
  { id: "press-lift", label: "Press Lift" },
  { id: "slow-drift", label: "Slow Drift" },
  { id: "case-shine", label: "Case Shine" },
  { id: "score-pulse", label: "Score Pulse" },
  { id: "magnetic-snap", label: "Magnetic Snap" }
];

const CARD_LAYOUT_PRESETS = [
  { id: "atlas-frame", label: "Atlas Frame" },
  { id: "floating-card", label: "Floating Card" },
  { id: "poster-stage", label: "Poster Stage" },
  { id: "gallery-plinth", label: "Gallery Plinth" },
  { id: "slab-case", label: "Slab Case" },
  { id: "passport", label: "Passport" },
  { id: "wide-back", label: "Wide Back" },
  { id: "tabletop", label: "Tabletop" },
  { id: "ticket", label: "Ticket" },
  { id: "pinboard", label: "Pinboard" }
];

const ACTIVE_CARD_EXPERIENCE = {
  openAnimation: CARD_OPEN_PRESETS.find((preset) => preset.id === "spotlight-bloom") || CARD_OPEN_PRESETS[0],
  interaction: CARD_INTERACTION_PRESETS.find((preset) => preset.id === "press-lift") || CARD_INTERACTION_PRESETS[0],
  cardLayout: CARD_LAYOUT_PRESETS.find((preset) => preset.id === "tabletop") || CARD_LAYOUT_PRESETS[0]
};

const CARD_ART = {
  aquatic: "/assets/card-art/aquatic.png",
  "control-pressure": "/assets/card-art/control-pressure.png",
  neutral: "/assets/card-art/neutral-signal.png",
  "rhythm-pace": "/assets/card-art/rhythm-pace.png",
  "spatial-timing": "/assets/card-art/spatial-timing.png",
  "winter-endurance": "/assets/card-art/winter-endurance.png"
};

const FRAMED_CARD_PANEL_PROMPT_VERSIONS = new Set(["common-ground-card-panel-v2"]);

const CARD_THEME_LABELS = {
  aquatic: "Water rhythm card",
  "control-pressure": "Control pressure card",
  neutral: "Open signal card",
  "rhythm-pace": "Rhythm pace card",
  "spatial-timing": "Spatial timing card",
  "winter-endurance": "Alpine endurance card"
};

const EMPTY_CARD_PANEL_MANIFEST = { states: {} };
const CURRENT_CARD_BACK_COPY_VERSION = "common-ground-card-back-v13-teach-sport-no-watch-for";

const SIGNAL_LABELS = {
  high: "High",
  medium: "Medium",
  low: "Low",
  insufficient_data: "Limited"
};

function titleBucket(bucket) {
  const normalized = String(bucket || "insufficient_data");
  return SIGNAL_LABELS[normalized] || normalized.replaceAll("_", " ");
}

async function getJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function fallbackBriefing(card, reason = "The Gemini backend is not available from this dev server.") {
  const olympicMix = joinReadableList((card.olympicPanel.topSportTags || []).map(displaySportName));
  const paralympicMix = joinReadableList((card.paralympicPanel.topSportTags || []).map(displaySportName));
  const olympicCue = getPanelVisualCue(card.olympicPanel);
  const paralympicCue = getPanelVisualCue(card.paralympicPanel);
  const geography = getGeographySignals(card).length ? joinReadableList(getGeographySignals(card)) : card.geographySnapshot;
  return {
    source: "react-fallback",
    model: "safe-fallback",
    briefing: {
      stateScene: `${card.stateName} reads as a layered state sport story: ${geography}. Public Team USA and geography data may suggest several fan-discovery paths without implying geography determines outcomes.`,
      sportMix: {
        olympic: olympicMix ? `Olympic side: ${olympicMix}.` : `Olympic side: ${card.olympicPanel.sportFamily}.`,
        paralympic: paralympicMix ? `Paralympic side: ${paralympicMix}.` : `Paralympic side: ${card.paralympicPanel.sportFamily}.`
      },
      whyInteresting: "The state-wide hook is contrast: fans can compare different settings, surfaces, and movement rhythms inside one shared state card.",
      geographyLens: `${card.geographySnapshot} could help fans understand why varied sport environments appear in this aggregate state view.`,
      fanHook: "Start with the featured pairing, then scan the broader mix for sports that look unrelated but share rhythm, spacing, pacing, precision, or equipment-control ideas.",
      surprisingConnection: `${olympicCue} and ${paralympicCue} look different, but both can point fans toward ${card.sharedTrait.name.toLowerCase()} as a shared viewing idea.`,
      sharedSignal: `${card.sharedTrait.name}: ${card.sharedTrait.description}`,
      exploreNext: "Try the State Sync Challenge as a fan-game interaction only; it is not a performance measurement or comparison.",
      dataSafetyNote: "Aggregate state view only. No individual names, likenesses, finish times, scoring results, rankings, medals, or performance predictions.",
      gameIntro: `Try a short fan challenge that reflects ${card.sharedTrait.name.toLowerCase()} as a personal interaction only.`,
      complianceWarnings: [reason]
    },
    complianceWarnings: [reason]
  };
}

function fallbackGameReflection(card, result, reason = "The Gemini backend is not available from this dev server.") {
  return {
    reflection: `${result.summary} That could help you appreciate why ${card.sharedTrait.name.toLowerCase()} matters across several sport families. This is a fan challenge only and does not measure ability or compare you with anyone.`,
    model: "safe-fallback",
    warnings: [reason]
  };
}

function uniqueSourceRefs(refs) {
  const seen = new Set();
  return refs.filter((ref) => {
    const key = `${ref.label}-${ref.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatExcludedRows(rows = {}) {
  const entries = Object.entries(rows);
  if (!entries.length) return "none";
  return entries.map(([key, value]) => `${key}: ${value}`).join(", ");
}

function getRosterCounts(card) {
  return card?.hometownRosterCounts || { olympic: 0, paralympic: 0, total: 0 };
}

function formatMapHint(card) {
  const counts = getRosterCounts(card);
  return `${card.stateName}: ${counts.olympic} Olympic, ${counts.paralympic} Paralympic, ${counts.total} total public roster records.`;
}

function getCardStory(card) {
  return card?.cardStory || {
    themeName: card?.sharedTrait?.name || getCardThemeLabel(card),
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
    fanChallengeName: `${card?.sharedTrait?.name || "State Sync"} Challenge`
  };
}

function getGeographySignals(card) {
  const storySignals = getCardStory(card).geographySignal || [];
  const signals = storySignals.length ? storySignals : card.terrainSignals || [];
  return signals.filter(Boolean).slice(0, 5);
}

function getCardThemeName(card) {
  return getCardStory(card).themeName || card.sharedTrait?.name || getCardThemeLabel(card);
}

function getCardTheme(card) {
  const counts = getRosterCounts(card);
  const text = `${card.olympicPanel.sportFamily} ${card.paralympicPanel.sportFamily} ${card.sharedTrait.name} ${card.sharedTrait.description}`;
  if (!counts.total || card.hometownPresenceBucket === "insufficient_data") return "neutral";
  if (/aquatic|water|surf|sail|swimming|coast|ocean/i.test(text)) return "aquatic";
  if (/winter|snow|mountain|endurance|pace/i.test(text)) return "winter-endurance";
  if (/precision|team|spatial|focus/i.test(text)) return "spatial-timing";
  if (/balance|power|pressure|contact|mixed|control/i.test(text)) return "control-pressure";
  return "rhythm-pace";
}

function getCardThemeLabel(card) {
  return CARD_THEME_LABELS[getCardTheme(card)] || CARD_THEME_LABELS.neutral;
}

function shortProgramName(program) {
  return program === "paralympic" ? "Paralympic" : "Olympic";
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

function getPanelVisualCue(panel) {
  return displaySportName(panel?.primarySportTag || panel?.topSportTags?.[0] || "Generalized sport-family cue");
}

function panelProgramLabel(panel) {
  return panel?.primarySportTag
    ? `${shortProgramName(panel.program)} featured sport`
    : `${shortProgramName(panel.program)} sport-family`;
}

function getPanelTopSportText(panel) {
  if (panel?.aggregateSignal === "insufficient_data") return "No sourced public sport tag is available in this dataset.";
  return "Generalized because the sourced sport-tag count is limited.";
}

function panelThemePhrase(panel) {
  const family = String(panel?.sportFamily || "").toLowerCase();
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

function readableGeographyLens(panel, visualCue) {
  const raw = String(panel?.geographyConnection || "").trim();
  const geography = raw
    .replace(/\s+could help fans frame the state's .*? sport-family presence without implying geography causes outcomes\.$/i, "")
    .trim();
  if (geography && geography !== raw) {
    return `${geography} could show how regional geography may offer useful context for ${visualCue}'s ${panelThemePhrase(panel)} qualities.`;
  }
  return raw || getPanelTopSportText(panel);
}

function watchLensForSport(visualCue, panel) {
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

function fanTakeawayForSport(visualCue, panel, sharedTraitName = "") {
  const sport = String(visualCue || "").toLowerCase();
  if (/water polo/.test(sport)) {
    return "This panel is about rhythm under pressure: players are constantly reading space, coordinating, and moving through resistance.";
  }
  if (/triathlon/.test(sport)) {
    return "This panel extends the waterline idea into endurance: pacing, transitions, and control across changing environments.";
  }
  if (/swimming|surfing|sailing|rowing|canoe/.test(sport)) {
    return "This panel keeps the card close to water movement: rhythm, balance, and control while conditions shift.";
  }
  return `${visualCue} helps fans read ${sharedTraitName || panel?.sportFamily || "the shared trait"} through a specific sport instead of an abstract data label.`;
}

function subtitleForSport(visualCue, panel) {
  const sport = String(visualCue || "").toLowerCase();
  if (/water polo/.test(sport)) return "Aquatic team sport · 7 in water · possession pressure";
  if (/triathlon/.test(sport)) return "Swim · bike · run · transition control";
  if (/swimming/.test(sport)) return "Water rhythm · lane tempo · repeatable control";
  if (/track/.test(sport)) return "Pace changes · clean starts · sustained control";
  if (/cycling/.test(sport)) return "Road rhythm · equipment control · outdoor pace";
  if (/shooting|archery/.test(sport)) return "Quiet setup · focus line · repeat control";
  return String(panel?.sportFamily || "Sport-family story").replaceAll(" / ", " · ");
}

function factChipsForSport(visualCue, panel) {
  const sport = String(visualCue || "").toLowerCase();
  if (/water polo/.test(sport)) return ["7 in water", "4 quarters", "Possession pressure", "One-hand control"];
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

function moduleMixForSport(visualCue, panel) {
  const sport = String(visualCue || "").toLowerCase();
  const family = String(panel?.sportFamily || "").toLowerCase();
  if (/water polo/.test(sport)) return ["Hidden Skill", "State Culture", "Watch Hook"];
  if (/triathlon/.test(sport)) return ["Pace Shift", "Gear/Setup", "Broadcast Moment"];
  if (/skateboarding|gymnastics|climbing|surfing|equestrian|breaking/.test(sport)) return ["Hidden Skill", "Terrain/Environment Lens", "Watch Hook"];
  if (/cycling/.test(sport)) return ["Gear/Setup", "Pace Shift", "Terrain/Environment Lens"];
  if (/shooting|archery/.test(sport) || /precision|focus/.test(family)) return ["Hidden Skill", "Rules Snapshot", "Watch Hook"];
  return ["Watch Hook", "Sport Family Link", "Challenge Link"];
}

function qaFactsForSport(visualCue, panel) {
  const sport = String(visualCue || "").toLowerCase();
  const stateConnection = readableGeographyLens(panel, visualCue);
  if (/water polo/.test(sport)) {
    return {
      howItWorks: "Water polo is played by two teams of seven in the water, including a goalkeeper. Each attack has to form quickly while everyone is swimming or treading water.",
      watchValue: "The ball moves fast, but the sharper read often happens before the pass, as players shift and fake to open a lane.",
      stateConnection,
      cardTrait: "Water polo connects to the shared trait through spacing, body position, and quick rhythm changes in a pool where no one has stable footing."
    };
  }
  if (/triathlon/.test(sport)) {
    return {
      howItWorks: "Para triathlon combines a swim, bike segment, run, and transition strategy across changing surfaces and equipment needs.",
      watchValue: "The transitions carry their own drama because every shift from water to bike to run changes the pacing problem.",
      stateConnection,
      cardTrait: "Para triathlon connects to the shared trait through pacing and adaptation across changing surfaces."
    };
  }
  return {
    howItWorks: `${visualCue} sits inside the card's ${panelThemePhrase(panel)} theme.`,
    watchValue: watchLensForSport(visualCue, panel),
    stateConnection,
    cardTrait: fanTakeawayForSport(visualCue, panel)
  };
}

function getPanelBackCopy(panel) {
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

function getPanelBackCopyForDisplay(panel) {
  if (panel?.cardBackCopyVersion === CURRENT_CARD_BACK_COPY_VERSION && panel?.cardBackCopy) {
    return panel.cardBackCopy;
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
  return {
    ...fallback,
    featuredCue: displaySportName(legacy.featuredCue || fallback.featuredCue),
    moduleMix: Array.isArray(legacy.moduleMix) && legacy.moduleMix.length ? legacy.moduleMix : fallback.moduleMix,
    subtitle: legacy.subtitle || legacy.sportFamilyTheme || fallback.subtitle,
    qaFacts: legacyQaFacts,
    factChips: Array.isArray(legacy.factChips) && legacy.factChips.length ? legacy.factChips : fallback.factChips,
  };
}

function getPanelArtUrl(card, program, manifest) {
  const panel = manifest?.states?.[card.stateCode]?.[program];
  if (panel?.url && !FRAMED_CARD_PANEL_PROMPT_VERSIONS.has(panel.promptVersion)) return panel.url;
  const theme = getCardTheme(card);
  return CARD_ART[theme] || CARD_ART.neutral;
}

function mergeGeneratedPanelData(card, manifest) {
  const statePanels = manifest?.states?.[card?.stateCode] || {};
  if (!card || (!statePanels.olympic && !statePanels.paralympic)) return card;

  function mergePanel(program, panel) {
    const generated = statePanels[program] || {};
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
    olympicPanel: mergePanel("olympic", card.olympicPanel),
    paralympicPanel: mergePanel("paralympic", card.paralympicPanel)
  };
}

const ICON_PATHS = {
  map: <><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" /><line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" /></>,
  cards: <><rect x="2" y="5" width="15" height="14" rx="2" /><path d="M6 5V3a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-2" /></>,
  game: <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="21.17" y1="8" x2="12" y2="8" /><line x1="3.95" y1="6.06" x2="8" y2="14" /><line x1="10.88" y1="21.94" x2="15" y2="14" /></>,
  method: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></>,
  locate: <><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></>,
  reset: <><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-3" /></>,
  moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
  sun: <><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></>,
  home: <><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>,
  close: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
};

function Icon({ name, size = 18, strokeWidth = 1.8, className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

/*
Card lab toggle logic, parked while the selected card experience is locked to
Spotlight / Press Lift / Tabletop. Uncomment this block plus the App state
snippet near App() if we want live controls back.

function readPresetIndex(storageKey, presets) {
  try {
    const saved = window.localStorage.getItem(storageKey);
    const index = presets.findIndex((preset) => preset.id === saved);
    return index >= 0 ? index : 0;
  } catch {
    return 0;
  }
}

function CardLabToggle({ label, value, index, total, onNext }) {
  return (
    <button className="card-lab-toggle" type="button" onClick={onNext} aria-label={`Switch ${label.toLowerCase()}. Current ${label.toLowerCase()} is ${value.label}`}>
      <span>{label}</span>
      <strong>{value.label}</strong>
      <em>{index + 1}/{total}</em>
    </button>
  );
}

function CardLabControls({
  openAnimation,
  openAnimationIndex,
  onNextOpenAnimation,
  interaction,
  interactionIndex,
  onNextInteraction,
  layout,
  layoutIndex,
  onNextLayout,
  compact = false
}) {
  return (
    <div className={`card-lab-controls ${compact ? "is-compact" : ""}`} aria-label="Card animation and layout controls">
      <CardLabToggle label="Open" value={openAnimation} index={openAnimationIndex} total={CARD_OPEN_PRESETS.length} onNext={onNextOpenAnimation} />
      <CardLabToggle label="Feel" value={interaction} index={interactionIndex} total={CARD_INTERACTION_PRESETS.length} onNext={onNextInteraction} />
      <CardLabToggle label="Layout" value={layout} index={layoutIndex} total={CARD_LAYOUT_PRESETS.length} onNext={onNextLayout} />
    </div>
  );
}
*/

function SignalLegend() {
  return (
    <div className="legend" aria-label="Participation signal legend">
      <span className="legend-item"><i className="signal-dot high" /><span>High</span></span>
      <span className="legend-item"><i className="signal-dot medium" /><span>Medium</span></span>
      <span className="legend-item"><i className="signal-dot low" /><span>Low</span></span>
      <span className="legend-item"><i className="signal-dot insufficient_data" /><span>Limited</span></span>
    </div>
  );
}

function MapProgressBar({ discovered, total }) {
  const pct = total > 0 ? Math.round((discovered / total) * 100) : 0;
  return (
    <div className="map-progress" aria-label={`${discovered} of ${total} states explored`}>
      <div className="map-progress-track" aria-hidden="true">
        <div className="map-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span>{discovered} / {total} states explored · {pct}%</span>
    </div>
  );
}

function RosterTooltip({ card, position }) {
  if (!card || !position) return null;
  const counts = getRosterCounts(card);

  return (
    <div
      className="map-tooltip"
      style={{ "--tooltip-x": `${position.x}px`, "--tooltip-y": `${position.y}px` }}
      aria-hidden="true"
    >
      <strong>{card.stateName}</strong>
      <span>Olympic: {counts.olympic}</span>
      <span>Paralympic: {counts.paralympic}</span>
      <span>Total: {counts.total}</span>
      <span>{card.sharedTrait.name}</span>
    </div>
  );
}


function TopNav({ page, view, onViewChange, onNavigate, onLogin, darkMode, onToggleDarkMode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const CLOSE_MS = 340;

  function openMenu() {
    setMenuMounted(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setMenuOpen(true)));
  }

  function closeMenu() {
    setMenuOpen(false);
    setTimeout(() => setMenuMounted(false), CLOSE_MS);
  }

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  function go(targetPage, targetView) {
    onNavigate(targetPage, targetView);
    closeMenu();
  }

  return (
    <>
      <header className={`top-nav${menuOpen ? " has-menu-open" : ""}`}>
        <div className="top-nav-inner">
          <button className="top-nav-brand" type="button" onClick={() => go("landing")} aria-label="Common Ground home">
            Common Ground
          </button>
          <nav className="top-nav-center" aria-label="Primary navigation">
            <button
              className={`top-nav-tab ${page === "app" && view === "explorer" ? "is-active" : ""}`}
              type="button"
              onClick={() => onNavigate("app", "explorer")}
            >
              <Icon name="map" size={15} />
              <span className="nav-tab-label">Map</span>
            </button>
            <button
              className={`top-nav-tab ${page === "app" && view === "collection" ? "is-active" : ""}`}
              type="button"
              onClick={() => onNavigate("app", "collection")}
            >
              <Icon name="cards" size={15} />
              <span className="nav-tab-label">Collection</span>
            </button>
          </nav>
          <div className="top-nav-actions">
            <button className="top-nav-icon-btn" type="button" onClick={onToggleDarkMode} aria-label="Toggle dark mode">
              <Icon name={darkMode ? "sun" : "moon"} size={16} strokeWidth={1.6} />
            </button>
            <button className="top-nav-login-btn" type="button" onClick={onLogin}>Login</button>
          </div>
          <button
            className={`hamburger-btn${menuOpen ? " is-open" : ""}`}
            type="button"
            onClick={menuOpen ? closeMenu : openMenu}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
          >
            <span className="hamburger-bar" />
            <span className="hamburger-bar" />
            <span className="hamburger-bar" />
          </button>
        </div>
      </header>

      {menuMounted && (
        <div
          id="mobile-menu"
          className={`mobile-menu-overlay${menuOpen ? " is-open" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div className="mobile-menu-header">
            <button className="top-nav-brand" type="button" onClick={() => go("landing")}>
              Common Ground
            </button>
            <button className="mobile-menu-close" type="button" onClick={closeMenu} aria-label="Close menu">
              <Icon name="close" size={16} strokeWidth={2} />
            </button>
          </div>

          <nav className="mobile-menu-nav">
            <button
              className={`mobile-menu-link${page === "landing" ? " is-active" : ""}`}
              type="button"
              onClick={() => go("landing")}
              style={{ "--i": 0 }}
            >
              <span className="mobile-menu-link-icon"><Icon name="home" size={26} strokeWidth={1.4} /></span>
              Home
            </button>
            <button
              className={`mobile-menu-link${page === "app" && view === "explorer" ? " is-active" : ""}`}
              type="button"
              onClick={() => go("app", "explorer")}
              style={{ "--i": 1 }}
            >
              <span className="mobile-menu-link-icon"><Icon name="map" size={26} strokeWidth={1.4} /></span>
              Map
            </button>
            <button
              className={`mobile-menu-link${page === "app" && view === "collection" ? " is-active" : ""}`}
              type="button"
              onClick={() => go("app", "collection")}
              style={{ "--i": 2 }}
            >
              <span className="mobile-menu-link-icon"><Icon name="cards" size={26} strokeWidth={1.4} /></span>
              Collection
            </button>
          </nav>
          <div className="mobile-menu-sep" style={{ "--i": 3 }} />
          <div className="mobile-menu-foot">
            <button
              className="mobile-menu-row"
              type="button"
              onClick={onToggleDarkMode}
              style={{ "--i": 4 }}
            >
              <span>{darkMode ? "Light mode" : "Dark mode"}</span>
              <Icon name={darkMode ? "sun" : "moon"} size={20} strokeWidth={1.5} />
            </button>
            <button
              className="primary-button mobile-menu-login"
              type="button"
              onClick={() => { onLogin(); closeMenu(); }}
              style={{ "--i": 5 }}
            >
              Login
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function LandingPage({ onNavigate, onLogin, darkMode, onToggleDarkMode }) {
  return (
    <div className="landing-page">
      <TopNav page="landing" view={null} onViewChange={() => {}} onNavigate={onNavigate} onLogin={onLogin} darkMode={darkMode} onToggleDarkMode={onToggleDarkMode} />

      <section className="landing-hero">
        <div className="landing-section-inner">
          <p className="eyebrow landing-eyebrow">Olympic + Paralympic Discovery</p>
          <h1 className="landing-hero-title">Explore the State Sport Atlas</h1>
          <p className="landing-hero-sub">Geography-powered fan discovery for LA28</p>
          <p className="landing-hero-body">Click any state on the interactive map to discover Olympic and Paralympic sport-family stories with equal prominence. Collect state cards, explore shared traits, and build your fan collection across all 50 states.</p>
          <div className="landing-cta-row">
            <button className="primary-button" type="button" onClick={() => onNavigate("app", "explorer")}>Explore the Map</button>
            <button className="ghost-button" type="button" onClick={() => onNavigate("app", "collection")}>View Collection</button>
          </div>
        </div>
      </section>

      <section className="landing-features">
        <div className="landing-section-inner">
          <h2 className="landing-features-heading">How it works</h2>
          <div className="landing-features-grid">
            <div className="landing-feature-card">
              <div className="landing-feature-icon"><Icon name="map" size={22} strokeWidth={1.5} /></div>
              <h3>Interactive Map</h3>
              <p>Click any state to explore public aggregate counts and sport families across the US. Discovered states are highlighted as you build your collection.</p>
            </div>
            <div className="landing-feature-card">
              <div className="landing-feature-icon"><Icon name="cards" size={22} strokeWidth={1.5} /></div>
              <h3>State Cards</h3>
              <p>Collect digital cards for each state. Each card features Olympic and Paralympic programs with equal visual weight and a holographic shine on hover.</p>
            </div>
            <div className="landing-feature-card">
              <div className="landing-feature-icon"><Icon name="game" size={22} strokeWidth={1.5} /></div>
              <h3>Fan Challenges</h3>
              <p>Try short fan challenges tied to the shared sport trait connecting each state's Olympic and Paralympic panels.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-cta2">
        <div className="landing-section-inner landing-cta2-inner">
          <h2 className="landing-cta2-title">Start Your Collection Today</h2>
          <p className="landing-cta2-body">No account required to explore. Select states on the map to unlock cards and track your journey across all 50 states.</p>
          <button className="primary-button" type="button" onClick={() => onNavigate("app", "explorer")}>Begin Exploring</button>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div>
            <strong className="landing-footer-brand">Common Ground</strong>
            <p>Geography-powered fan discovery</p>
          </div>
          <nav className="landing-footer-nav" aria-label="Footer">
            <button className="landing-footer-link" type="button" onClick={() => onNavigate("app", "explorer")}>Map</button>
            <button className="landing-footer-link" type="button" onClick={() => onNavigate("app", "collection")}>Collection</button>
            <button className="landing-footer-link" type="button" onClick={() => onNavigate("app", "methodology")}>Methodology</button>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function LoginPage({ onNavigate, onLogin, darkMode, onToggleDarkMode }) {
  const [tab, setTab] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    onLogin();
  }

  return (
    <div className="login-page">
      <TopNav page="login" view={null} onViewChange={() => {}} onNavigate={onNavigate} onLogin={onLogin} darkMode={darkMode} onToggleDarkMode={onToggleDarkMode} />

      <div className="login-layout">
        <div className="login-left">
          <div className="login-left-content">
            <h2 className="login-left-title">Common Ground</h2>
            <p className="login-left-tagline">Discover. Collect. Connect.</p>
            <p className="login-left-body">Track your state-card discoveries and save your collection across sessions. Build your complete 50-state card set.</p>
            <div className="login-card-visual" aria-hidden="true">
              <div className="login-card-back" />
              <div className="login-card-front" />
            </div>
          </div>
        </div>

        <div className="login-right">
          <div className="login-form-wrap">
            <div className="login-tabs" role="tablist">
              <button className={`login-tab ${tab === "login" ? "is-active" : ""}`} type="button" role="tab" aria-selected={tab === "login"} onClick={() => setTab("login")}>Login</button>
              <button className={`login-tab ${tab === "create" ? "is-active" : ""}`} type="button" role="tab" aria-selected={tab === "create"} onClick={() => setTab("create")}>Create Account</button>
            </div>

            {tab === "login" && (
              <form className="login-form" onSubmit={handleSubmit}>
                <div className="login-form-header">
                  <h3>Welcome back</h3>
                  <p>Sign in to save your collection</p>
                </div>
                <label className="login-field">
                  <span>Email</span>
                  <input className="login-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
                </label>
                <label className="login-field">
                  <span>Password</span>
                  <input className="login-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
                </label>
                <button className="login-forgot" type="button">Forgot password?</button>
                <button className="primary-button login-submit" type="submit">Log In</button>
                <div className="login-or"><span>or</span></div>
                <button className="ghost-button login-google" type="button">Continue with Google</button>
                <p className="login-terms">By continuing you agree to our <button className="login-terms-link" type="button">Terms of Service</button></p>
              </form>
            )}

            {tab === "create" && (
              <form className="login-form" onSubmit={handleSubmit}>
                <div className="login-form-header">
                  <h3>Create your account</h3>
                  <p>Start tracking your discoveries</p>
                </div>
                <label className="login-field">
                  <span>Name</span>
                  <input className="login-input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
                </label>
                <label className="login-field">
                  <span>Email</span>
                  <input className="login-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
                </label>
                <label className="login-field">
                  <span>Password</span>
                  <input className="login-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a password" autoComplete="new-password" />
                </label>
                <button className="primary-button login-submit" type="submit">Create Account</button>
                <div className="login-or"><span>or</span></div>
                <button className="ghost-button login-google" type="button">Continue with Google</button>
                <p className="login-terms">By creating an account you agree to our <button className="login-terms-link" type="button">Terms of Service</button></p>
              </form>
            )}
          </div>
        </div>
      </div>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div>
            <strong className="landing-footer-brand">Common Ground</strong>
            <p>Geography-powered fan discovery</p>
          </div>
          <nav className="landing-footer-nav" aria-label="Footer">
            <button className="landing-footer-link" type="button" onClick={() => onNavigate("app", "explorer")}>Map</button>
            <button className="landing-footer-link" type="button" onClick={() => onNavigate("app", "collection")}>Collection</button>
            <button className="landing-footer-link" type="button" onClick={() => onNavigate("app", "methodology")}>Methodology</button>
          </nav>
        </div>
      </footer>
    </div>
  );
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error(error);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="load-state">
          <h1>Common Ground hit a UI error.</h1>
          <p>{this.state.error.message}</p>
        </main>
      );
    }

    return this.props.children;
  }
}

function StateMap({ mapTopology, features, geoFeatures, cardsByCode, selectedCode, onSelect, discoveredCodes = new Set(), totalStates = 0 }) {
  const [hint, setHint] = useState("Hover or focus a state to preview Olympic, Paralympic, and total counts.");
  const [hoverTip, setHoverTip] = useState(null);
  const [viewport, setViewport] = useState({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const viewportRef = useRef(viewport);
  const suppressClickRef = useRef(false);
  const path = useMemo(() => geoPath(), []);
  const mapCenter = { x: 487.5, y: 305 };
  const borderPath = useMemo(() => {
    if (!mapTopology) return "";
    return path(mesh(mapTopology, mapTopology.objects.states, (a, b) => a !== b));
  }, [mapTopology, path]);
  const projectedFeatureCodes = useMemo(() => new Set(features.map((item) => item.properties.stateCode).filter(Boolean)), [features]);
  const territoryFeatures = useMemo(
    () => geoFeatures.filter((item) => {
      const code = item.properties.stateCode;
      return code && !projectedFeatureCodes.has(code) && cardsByCode.has(code);
    }),
    [cardsByCode, geoFeatures, projectedFeatureCodes]
  );
  const territoryPath = useMemo(() => {
    if (!territoryFeatures.length) return null;
    const collection = { type: "FeatureCollection", features: territoryFeatures };
    const projection = geoMercator().fitExtent([[30, 6], [142, 50]], collection);
    return geoPath(projection);
  }, [territoryFeatures]);
  const selectedFeature = features.find((item) => item.properties.stateCode === selectedCode);
  const selectedCard = cardsByCode.get(selectedCode);
  const selectedCentroid = selectedFeature ? path.centroid(selectedFeature) : null;

  useEffect(() => {
    if (selectedCard) setHint(formatMapHint(selectedCard));
  }, [selectedCard]);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    function onWindowMouseMove(event) {
      if (!dragRef.current && event.buttons === 1 && isPointInsideSvg(event.clientX, event.clientY)) {
        startDrag(event.clientX, event.clientY);
      }
      updateDrag(event.clientX, event.clientY);
    }

    function onWindowMouseUp() {
      endDrag();
    }

    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
    };
  }, []);

  function centerOnFeature(item, scale = 2.35) {
    const centroid = path.centroid(item);
    if (!Number.isFinite(centroid[0]) || !Number.isFinite(centroid[1])) return;
    setViewport({
      scale,
      x: mapCenter.x - centroid[0] * scale,
      y: mapCenter.y - centroid[1] * scale
    });
  }

  function centerOnCode(code, scale = 2.35) {
    const item = features.find((featureItem) => featureItem.properties.stateCode === code);
    if (item) centerOnFeature(item, scale);
  }

  function clampScale(scale) {
    return Math.min(4, Math.max(1, scale));
  }

  function resetMap() {
    setViewport({ scale: 1, x: 0, y: 0 });
    setHoverTip(null);
    if (selectedCard) setHint(formatMapHint(selectedCard));
  }

  function zoomAtViewBoxPoint(anchor, nextScale) {
    const clampedScale = clampScale(nextScale);
    if (clampedScale === 1) {
      resetMap();
      return;
    }

    setViewport((current) => {
      const mapX = (anchor.x - current.x) / current.scale;
      const mapY = (anchor.y - current.y) / current.scale;
      return {
        scale: clampedScale,
        x: anchor.x - mapX * clampedScale,
        y: anchor.y - mapY * clampedScale
      };
    });
  }

  function clientToViewBox(clientX, clientY) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return mapCenter;
    return {
      x: (clientX - rect.left) * (975 / rect.width),
      y: (clientY - rect.top) * (610 / rect.height)
    };
  }

  function zoomIn() {
    zoomAtViewBoxPoint(mapCenter, viewport.scale + 0.45);
  }

  function zoomOut() {
    zoomAtViewBoxPoint(mapCenter, viewport.scale - 0.45);
  }

  function locateCurrentState() {
    if (!navigator.geolocation) {
      setHint("Browser location is not available here. You can still choose a state from the picker.");
      return;
    }

    setIsLocating(true);
    setHint("Requesting browser location. Coordinates stay in this local app and are only used to match a state boundary.");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const point = [coords.longitude, coords.latitude];
        const matchedFeature = geoFeatures.find((item) => geoContains(item, point));
        const matchedCode = matchedFeature?.properties?.stateCode;
        const matchedCard = matchedCode ? cardsByCode.get(matchedCode) : null;

        if (matchedFeature && matchedCard) {
          onSelect(matchedCode);
          centerOnCode(matchedCode, 2.6);
          setHint(`${formatMapHint(matchedCard)} Located from browser coordinates.`);
        } else if (matchedCode) {
          setHint(`Your browser location matched ${matchedFeature.properties.name}, but no state card is loaded for it yet.`);
        } else {
          setHint("Could not match the browser location to a supported U.S. geography boundary.");
        }
        setIsLocating(false);
      },
      () => {
        setHint("Location was not available. You can still zoom and select a state manually.");
        setIsLocating(false);
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 }
    );
  }

  function getPointerPosition(event) {
    const rect = event.currentTarget.ownerSVGElement.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function describeFeature(item, event) {
    const card = cardsByCode.get(item.properties.stateCode);
    if (card) {
      setHint(formatMapHint(card));
      if (event) setHoverTip({ card, position: getPointerPosition(event) });
    } else {
      setHint(`${item.properties.name}: real map boundary shown. No card is loaded for this geography.`);
      setHoverTip(null);
    }
  }

  function handleWheel(event) {
    event.preventDefault();
    const anchor = clientToViewBox(event.clientX, event.clientY);
    const direction = event.deltaY < 0 ? 1 : -1;
    const step = event.ctrlKey || event.metaKey ? 0.28 : 0.18;
    zoomAtViewBoxPoint(anchor, viewport.scale + direction * step);
  }

  function startDrag(clientX, clientY) {
    const currentViewport = viewportRef.current;
    if (currentViewport.scale <= 1) return false;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || dragRef.current) return false;
    dragRef.current = {
      clientX,
      clientY,
      rect,
      viewport: currentViewport
    };
    setIsDragging(true);
    return true;
  }

  function updateDrag(clientX, clientY) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (clientX - drag.clientX) * (975 / drag.rect.width);
    const dy = (clientY - drag.clientY) * (610 / drag.rect.height);
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) suppressClickRef.current = true;
    setViewport({
      ...drag.viewport,
      x: drag.viewport.x + dx,
      y: drag.viewport.y + dy
    });
  }

  function endDrag() {
    dragRef.current = null;
    setIsDragging(false);
    if (suppressClickRef.current) {
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  }

  function isPointInsideSvg(clientX, clientY) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  function handlePointerDown(event) {
    if (event.button !== 0) return;
    const started = startDrag(event.clientX, event.clientY);
    if (!started) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    updateDrag(event.clientX, event.clientY);
  }

  function handlePointerEnd(event) {
    endDrag();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  return (
    <>
      <div className="map-wrap">
        <div className="map-controls" aria-label="Map controls">
          <button className="map-control-button" type="button" onClick={zoomIn} aria-label="Zoom in" title="Zoom in">+</button>
          <button className="map-control-button" type="button" onClick={locateCurrentState} disabled={isLocating} aria-label="Use my location to zoom to my state" title="Use my location to zoom to my state">
            <Icon name="locate" size={18} strokeWidth={2} />
          </button>
          <button className="map-control-button" type="button" onClick={zoomOut} aria-label="Zoom out" title="Zoom out">−</button>
          <button className="map-control-button" type="button" onClick={resetMap} aria-label="Reset map" title="Reset map">
            <Icon name="reset" size={18} strokeWidth={2} />
          </button>
        </div>
        <svg
          ref={svgRef}
          className={`state-map ${isDragging ? "is-dragging" : ""}`}
          viewBox="0 0 975 610"
          role="img"
          aria-label="U.S. map with selectable state and territory cards"
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onPointerLeave={handlePointerEnd}
        >
          <g className="map-viewport" transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
            <g className="actual-map">
              {features.map((item) => {
                const code = item.properties.stateCode;
                const card = cardsByCode.get(code);
                const counts = getRosterCounts(card);
                const signal = card?.hometownPresenceBucket || "insufficient_data";
                const className = [
                  "state-path",
                  card ? "has-data" : "no-data",
                  signal,
                  code === selectedCode ? "is-selected" : "",
                  discoveredCodes.has(code) ? "is-discovered" : ""
                ].filter(Boolean).join(" ");

                return (
                  <path
                    key={item.id}
                    className={className}
                    d={path(item)}
                    data-state-code={code}
                    role={card ? "button" : "img"}
                    tabIndex={card ? 0 : -1}
                    aria-label={card ? `${card.stateName}, Olympic count ${counts.olympic}, Paralympic count ${counts.paralympic}, total ${counts.total}` : `${item.properties.name}, no state card loaded`}
                    onMouseEnter={(event) => describeFeature(item, event)}
                    onMouseMove={(event) => describeFeature(item, event)}
                    onFocus={() => describeFeature(item)}
                    onMouseLeave={() => {
                      setHoverTip(null);
                      if (selectedCard) setHint(formatMapHint(selectedCard));
                    }}
                    onBlur={() => selectedCard && setHint(formatMapHint(selectedCard))}
                    onClick={(event) => {
                      if (suppressClickRef.current) {
                        event.preventDefault();
                        return;
                      }
                      if (card) onSelect(card.stateCode);
                    }}
                    onKeyDown={(event) => {
                      if (card && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        onSelect(card.stateCode);
                      }
                    }}
                  />
                );
              })}
            </g>
            {borderPath && <path className="state-borders" d={borderPath} />}
            <g className="discovered-markers" aria-hidden="true">
              {features.map((item) => {
                const code = item.properties.stateCode;
                if (!discoveredCodes.has(code)) return null;
                const centroid = path.centroid(item);
                if (!Number.isFinite(centroid[0]) || !Number.isFinite(centroid[1])) return null;
                const s = 1 / viewport.scale;
                return (
                  <g key={`chk-${code}`} transform={`translate(${centroid[0]} ${centroid[1]}) scale(${s})`} pointerEvents="none">
                    <circle className="check-bg" r="9" />
                    <polyline className="check-tick" points="-3.5,0.8 -1,3.3 5,-3.8" />
                  </g>
                );
              })}
            </g>
            {selectedCentroid && viewport.scale < 2.9 && (
              <text className="selected-state-label" x={selectedCentroid[0]} y={selectedCentroid[1]}>
                {selectedCode}
              </text>
            )}
          </g>
          {territoryPath && territoryFeatures.length > 0 && (
            <g className="territory-inset-layer" transform="translate(846 510)">
              {territoryFeatures.map((item, index) => {
                const code = item.properties.stateCode;
                const card = cardsByCode.get(code);
                const counts = getRosterCounts(card);
                const signal = card?.hometownPresenceBucket || "insufficient_data";
                const className = [
                  "territory-inset",
                  signal,
                  code === selectedCode ? "is-selected" : ""
                ].filter(Boolean).join(" ");

                return (
                  <g
                    key={code}
                    className={className}
                    data-state-code={code}
                    transform={`translate(${index * 150} 0)`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${card.stateName}, Olympic ${counts.olympic}, Paralympic ${counts.paralympic}, total ${counts.total}`}
                    onMouseEnter={(event) => describeFeature(item, event)}
                    onMouseMove={(event) => describeFeature(item, event)}
                    onFocus={() => describeFeature(item)}
                    onMouseLeave={() => {
                      setHoverTip(null);
                      if (selectedCard) setHint(formatMapHint(selectedCard));
                    }}
                    onBlur={() => selectedCard && setHint(formatMapHint(selectedCard))}
                    onClick={() => onSelect(card.stateCode)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(card.stateCode);
                      }
                    }}
                  >
                    <rect className="territory-inset-hit" x="34" y="8" width="104" height="40" rx="6" />
                    <path className="territory-inset-shape" d={territoryPath(item)} />
                    {code === selectedCode && (
                      <text className="territory-inset-code" x="15" y="34">{code}</text>
                    )}
                  </g>
                );
              })}
            </g>
          )}
        </svg>
        <RosterTooltip card={hoverTip?.card} position={hoverTip?.position} />
      </div>
      <SignalLegend />
      <MapProgressBar discovered={discoveredCodes.size} total={totalStates} />
    </>
  );
}

function StateSummary({ card }) {
  const geographySignals = getGeographySignals(card);
  return (
    <section className="state-summary">
      <div>
        <p className="eyebrow">Selected state</p>
        <h2>{card.stateName}</h2>
      </div>
      <p>{card.geographySnapshot}</p>
      <div className="metric-row">
        <span className="metric">Card theme <strong>{getCardThemeName(card)}</strong></span>
        <span className="metric">Olympic <strong>{titleBucket(card.olympicPanel.aggregateSignal)}</strong></span>
        <span className="metric">Paralympic <strong>{titleBucket(card.paralympicPanel.aggregateSignal)}</strong></span>
      </div>
      <div className="chip-row">
        {geographySignals.map((item) => <span className="chip" key={item}>{item}</span>)}
      </div>
    </section>
  );
}

const PANEL_QA_ROWS = [
  ["howItWorks", "How it works"],
  ["watchValue", "Why it's fun to watch"],
  ["stateConnection", "State connection"],
  ["cardTrait", "Card trait"]
];

function SportPanel({ panel }) {
  const copy = getPanelBackCopyForDisplay(panel);
  const visualCue = copy.featuredCue || getPanelVisualCue(panel);
  const factChips = Array.isArray(copy.factChips) ? copy.factChips.filter(Boolean).slice(0, 4) : [];
  const qaRows = PANEL_QA_ROWS
    .map(([key, label]) => [key, label, copy.qaFacts?.[key]])
    .filter(([, , value]) => String(value || "").trim());

  return (
    <section className="panel">
      <div className="panel-label">
        <span className={`program-tag ${panel.program}`}>{panelProgramLabel(panel)}</span>
      </div>
      <div className="panel-body">
        <h4>{visualCue}</h4>
        {copy.subtitle && <p className="panel-subtitle">{copy.subtitle}</p>}
        <div className="panel-qa-list">
          {qaRows.map(([key, label, value]) => (
            <div className="panel-qa-row" key={key}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        {factChips.length > 0 && (
          <div className="panel-fact-block">
            <span className="panel-chip-label">Quick facts</span>
            <div className="panel-fact-chips" aria-label={`${visualCue} card facts`}>
              {factChips.map((chip) => <span key={chip}>{chip}</span>)}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function SourceList({ refs }) {
  return (
    <div className="source-list">
      {refs.map((ref) => (
        <a className="source-chip" href={ref.url} target="_blank" rel="noreferrer" key={`${ref.label}-${ref.url}`}>
          {ref.label}
        </a>
      ))}
    </div>
  );
}

function PanelArtImage({ src, fallback }) {
  const [didError, setDidError] = useState(false);

  useEffect(() => {
    setDidError(false);
  }, [src]);

  return (
    <img
      src={didError ? fallback : src}
      alt=""
      aria-hidden="true"
      onError={() => setDidError(true)}
    />
  );
}

function CommonGroundSeal() {
  return (
    <span className="art-center-seal" aria-hidden="true">
      <span />
    </span>
  );
}

function CardArt({ card, compact = false, panelManifest = EMPTY_CARD_PANEL_MANIFEST }) {
  const theme = getCardTheme(card);
  const fallback = CARD_ART[theme] || CARD_ART.neutral;
  const olympicSrc = getPanelArtUrl(card, "olympic", panelManifest);
  const paralympicSrc = getPanelArtUrl(card, "paralympic", panelManifest);
  const themeName = getCardThemeName(card);

  return (
    <div className={`card-art card-art-${theme} ${compact ? "is-compact" : ""}`}>
      <div className="card-art-stack">
        <div className="card-art-panel olympic-art-panel">
          <PanelArtImage src={olympicSrc} fallback={fallback} />
          <div className="art-vignette" />
          <span className="art-panel-label">{shortProgramName(card.olympicPanel.program)}</span>
          {!compact && <strong className="art-panel-sport">{getPanelVisualCue(card.olympicPanel)}</strong>}
        </div>
        <div className="card-art-panel paralympic-art-panel">
          <PanelArtImage src={paralympicSrc} fallback={fallback} />
          <div className="art-vignette" />
          <span className="art-panel-label">{shortProgramName(card.paralympicPanel.program)}</span>
          {!compact && <strong className="art-panel-sport">{getPanelVisualCue(card.paralympicPanel)}</strong>}
        </div>
        <CommonGroundSeal />
      </div>
      <div className="art-state-lockup">
        <strong>{card.stateName}</strong>
        <span>{compact ? themeName : "State Sync Challenge"}</span>
        {!compact && <em>{themeName} · {card.sharedTrait.name}</em>}
      </div>
    </div>
  );
}

function UnifiedStateCard({ card, sourceRefs, briefing, briefingLoading, onRefreshBriefing, onOpenChallenge, onFlipChange, panelManifest }) {
  const [flipped, setFlipped] = useState(false);
  const [displayBack, setDisplayBack] = useState(false);
  const [flipPhase, setFlipPhase] = useState(null); // null | "out" | "in"
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState({ x: 50, y: 50, angle: 120 });
  const [isHovered, setIsHovered] = useState(false);
  const tiltRef = useRef(null);
  const flipTimers = useRef([]);
  const cardStory = getCardStory(card);
  const counts = getRosterCounts(card);
  const olympicCue = getPanelVisualCue(card.olympicPanel);
  const paralympicCue = getPanelVisualCue(card.paralympicPanel);

  useEffect(() => {
    flipTimers.current.forEach(clearTimeout);
    flipTimers.current = [];
    setFlipped(false);
    setDisplayBack(false);
    setFlipPhase(null);
    setTilt({ x: 0, y: 0 });
    onFlipChange?.(false);
  }, [card.stateCode]);

  function toggleFlip() {
    if (flipPhase !== null) return;
    setFlipPhase("out");
    setTilt({ x: 0, y: 0 });

    const t1 = setTimeout(() => {
      const next = !flipped;
      setFlipped(next);
      setDisplayBack(next);
      setFlipPhase("in");
      onFlipChange?.(next);
    }, 220);

    const t2 = setTimeout(() => {
      setFlipPhase(null);
    }, 440);

    flipTimers.current = [t1, t2];
  }

  function handleMouseMove(e) {
    if (displayBack || flipPhase !== null) return;
    const el = tiltRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - rect.left) / rect.width;
    const dy = (e.clientY - rect.top) / rect.height;
    setTilt({ x: (0.5 - dy) * 18, y: (dx - 0.5) * 26 });
    setMousePos({ x: dx * 100, y: dy * 100, angle: dx * 180 + dy * 90 + 60 });
  }

  function handleMouseLeave() {
    setTilt({ x: 0, y: 0 });
    setIsHovered(false);
  }

  const frontClass = [
    "sports-card-face sports-card-front",
    displayBack ? "face-hidden" : "",
    !displayBack && flipPhase === "out" ? "flip-out" : "",
    !displayBack && flipPhase === "in" ? "flip-in" : "",
  ].filter(Boolean).join(" ");

  const backClass = [
    "sports-card-face sports-card-back",
    !displayBack ? "face-hidden" : "",
    displayBack && flipPhase === "in" ? "flip-in" : "",
    displayBack && flipPhase === "out" ? "flip-out" : "",
  ].filter(Boolean).join(" ");

  return (
    <section className="sports-card-shell">
      <div className="card-3d-viewport">
        <div
          ref={tiltRef}
          className="card-tilt-layer"
          style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onMouseEnter={() => setIsHovered(true)}
        >
          <div
            className={`sports-card ${isHovered && !displayBack ? "is-hovered" : ""}`}
            style={{ "--holo-x": `${mousePos.x}%`, "--holo-y": `${mousePos.y}%`, "--holo-angle": `${mousePos.angle}deg` }}
          >
            <article
              className={frontClass}
              aria-label={`${card.stateName} state card front — click to flip`}
              role="button"
              tabIndex={displayBack ? -1 : 0}
              onClick={toggleFlip}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleFlip(); } }}
            >
              <CardArt card={card} panelManifest={panelManifest} />
            </article>

            <article className={backClass} aria-label={`${card.stateName} state card data`}>
              <div className="card-back-scroll">
                <div className="card-header">
                  <p className="eyebrow">Shared geography view</p>
                  <h3>{card.stateName}</h3>
                  <p>{card.geographySnapshot}</p>
                  <div className="metric-row compact-metrics">
                    <span className="metric">State total <strong>{counts.total}</strong></span>
                    <span className="metric">Olympic count <strong>{counts.olympic}</strong></span>
                    <span className="metric">Paralympic count <strong>{counts.paralympic}</strong></span>
                  </div>
                </div>
                <div className="program-panel-grid">
                  <SportPanel panel={card.olympicPanel} />
                  <SportPanel panel={card.paralympicPanel} />
                </div>
                <section className="trait-band">
                  <div className="trait-badge">
                    <span>Shared trait across both featured sports</span>
                    <strong>{card.sharedTrait.name}</strong>
                  </div>
                  <p>This trait connects Olympic <strong>{olympicCue}</strong> and Paralympic <strong>{paralympicCue}</strong>: {card.sharedTrait.description}</p>
                </section>
                <BriefingPanel payload={briefing} loading={briefingLoading} onRefresh={onRefreshBriefing} compact />
                <div className="card-footer">
                  <SourceList refs={sourceRefs} />
                  <button className="primary-button" type="button" onClick={onOpenChallenge}>Try the State Sync Challenge</button>
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>

      <div className="card-action-row">
        <button className="ghost-button" type="button" onClick={toggleFlip}>
          {flipped ? "Flip to art" : "Flip to data"}
        </button>
        <button className="primary-button" type="button" onClick={onOpenChallenge}>Try the State Sync Challenge</button>
      </div>
    </section>
  );
}

function CardModal({
  card,
  sourceRefs,
  briefing,
  briefingLoading,
  onRefreshBriefing,
  onOpenChallenge,
  onClose,
  panelManifest
}) {
  const [isBackExpanded, setIsBackExpanded] = useState(false);
  const { openAnimation, interaction, cardLayout } = ACTIVE_CARD_EXPERIENCE;

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setIsBackExpanded(false);
  }, [card.stateCode]);

  return (
    <div className="card-modal-backdrop" role="dialog" aria-modal="true" aria-label={`${card.stateName} sports card`}>
      <button className="modal-scrim" type="button" aria-label="Close state card" onClick={onClose} />
      <div className={`card-modal-panel card-open-${openAnimation.id} card-interaction-${interaction.id} card-layout-${cardLayout.id} ${isBackExpanded ? "is-back-expanded" : ""}`}>
        <div className="modal-close-row">
          <button className="modal-close-button" type="button" onClick={onClose} aria-label="Close state card" />
        </div>
        <UnifiedStateCard
          card={card}
          sourceRefs={sourceRefs}
          briefing={briefing}
          briefingLoading={briefingLoading}
          onRefreshBriefing={onRefreshBriefing}
          onOpenChallenge={onOpenChallenge}
          onFlipChange={setIsBackExpanded}
          panelManifest={panelManifest}
        />
      </div>
    </div>
  );
}

function briefingSections(briefing = {}) {
  if (briefing.stateScene || briefing.sportMix || briefing.whyInteresting) {
    return [
      ["State Scene", briefing.stateScene],
      ["Sport Mix", [briefing.sportMix?.olympic, briefing.sportMix?.paralympic].filter(Boolean)],
      ["Why It's Interesting", briefing.whyInteresting],
      ["Geography Lens", briefing.geographyLens],
      ["Fan Hook", briefing.fanHook],
      ["Surprising Connection", briefing.surprisingConnection],
      ["Shared Signal", briefing.sharedSignal],
      ["Explore Next", briefing.exploreNext],
      ["Data Safety Note", briefing.dataSafetyNote]
    ].filter(([, value]) => Array.isArray(value) ? value.length : String(value || "").trim());
  }

  return [
    ["State Scene", briefing.summary],
    ["Sport Mix", [
      briefing.olympicNarrative ? `Olympic side: ${briefing.olympicNarrative}` : "",
      briefing.paralympicNarrative ? `Paralympic side: ${briefing.paralympicNarrative}` : ""
    ].filter(Boolean)],
    ["Shared Signal", briefing.sharedTraitExplanation],
    ["Explore Next", briefing.gameIntro]
  ].filter(([, value]) => Array.isArray(value) ? value.length : String(value || "").trim());
}

function BriefingPanel({ payload, loading, onRefresh, compact = false }) {
  if (loading || !payload) {
    return (
      <section className={`briefing-panel ${compact ? "is-compact" : ""}`}>
        <div className="panel-heading-row">
          <h3>Gemini State Briefing</h3>
          <button className="ghost-button small" type="button" onClick={onRefresh}>Refresh</button>
        </div>
        <p>Generating a safe, conditional briefing...</p>
      </section>
    );
  }
  const sections = briefingSections(payload.briefing);

  return (
    <section className={`briefing-panel ${compact ? "is-compact" : ""}`}>
      <div className="panel-heading-row">
        <h3>Gemini State Briefing</h3>
        <button className="ghost-button small" type="button" onClick={onRefresh}>Refresh</button>
      </div>
      <div className="briefing-section-grid">
        {sections.map(([label, value]) => (
          <article className="briefing-section" key={label}>
            <span>{label}</span>
            {Array.isArray(value) ? (
              <div className="briefing-list">
                {value.map((item) => <p key={item}>{item}</p>)}
              </div>
            ) : (
              <p>{value}</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function ReactionGrid({ card, onResult }) {
  const [target, setTarget] = useState(() => Math.floor(Math.random() * 16));
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [remaining, setRemaining] = useState(15);
  const finishedRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setRemaining((value) => value - 1), 1000);
    const targetTimer = setInterval(() => setTarget(Math.floor(Math.random() * 16)), 950);
    return () => {
      clearInterval(timer);
      clearInterval(targetTimer);
    };
  }, []);

  useEffect(() => {
    if (remaining <= 0 && !finishedRef.current) {
      finishedRef.current = true;
      onResult({
        type: "reaction_grid",
        summary: `You found ${hits} targets with ${misses} missed taps in this personal game.`,
        hits,
        misses
      });
    }
  }, [remaining, hits, misses, onResult]);

  useEffect(() => {
    function onKey(event) {
      if (event.key === " ") {
        event.preventDefault();
        setHits((value) => value + 1);
        setTarget(Math.floor(Math.random() * 16));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function hitCell(index) {
    if (index === target) {
      setHits((value) => value + 1);
      setTarget(Math.floor(Math.random() * 16));
    } else {
      setMisses((value) => value + 1);
    }
  }

  return (
    <>
      <div className="game-status">Reaction Grid: {Math.max(remaining, 0)} seconds left. Hits: {hits}. Misses: {misses}.</div>
      <div className="game-board" tabIndex="0" aria-label={`${card.stateName} reaction grid`}>
        <div className="reaction-grid">
          {Array.from({ length: 16 }, (_, index) => (
            <button
              key={index}
              className={`reaction-cell ${index === target ? "is-target" : ""}`}
              type="button"
              aria-label={`Grid cell ${index + 1}`}
              onClick={() => hitCell(index)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function CadenceKeeper({ card, onResult }) {
  const [taps, setTaps] = useState([]);
  const targetMs = 700;
  const requiredTaps = 14;
  const tapsRef = useRef([]);
  const finishedRef = useRef(false);

  function finish(nextTaps) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const intervals = nextTaps.slice(1).map((tap, index) => tap - nextTaps[index]);
    const averageError = intervals.length
      ? intervals.reduce((sum, interval) => sum + Math.abs(interval - targetMs), 0) / intervals.length
      : 0;
    const consistency = Math.max(0, Math.round(100 - averageError / 7));
    const rhythmLabel = consistency >= 82 ? "steady" : consistency >= 58 ? "developing" : "variable";
    onResult({
      type: "cadence_keeper",
      summary: `Your cadence stayed ${rhythmLabel} across ${requiredTaps} taps in this personal game.`,
      rhythmLabel
    });
  }

  function recordTap() {
    if (finishedRef.current) return;
    const nextTaps = [...tapsRef.current, performance.now()];
    tapsRef.current = nextTaps;
    setTaps(nextTaps);
    if (nextTaps.length >= requiredTaps) finish(nextTaps);
  }

  useEffect(() => {
    function onKey(event) {
      if (event.key === " ") {
        event.preventDefault();
        recordTap();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const progress = Math.min(taps.length / requiredTaps, 1) * 100;
  return (
    <>
      <div className="game-status">Cadence Keeper: {Math.max(requiredTaps - taps.length, 0)} taps left. Keep each tap close to the same tempo.</div>
      <div className="game-board" tabIndex="0" aria-label={`${card.stateName} cadence keeper`}>
        <button className="cadence-pad" type="button" onClick={recordTap}>
          <span>Tap here or press space</span>
          <strong>Keep a steady rhythm</strong>
        </button>
        <div className="cadence-meter" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
      </div>
    </>
  );
}

function ChallengeView({ card, briefing, onReturn, panelManifest }) {
  const [started, setStarted] = useState(false);
  const [result, setResult] = useState(null);
  const [reflection, setReflection] = useState(null);

  const onResult = React.useCallback(async (nextResult) => {
    setResult(nextResult);
    setStarted(false);
    try {
      const payload = await getJson("/api/gemini/game-reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stateSyncCardJson: card, result: nextResult })
      });
      setReflection(payload);
    } catch (error) {
      setReflection(fallbackGameReflection(card, nextResult, error.message));
    }
  }, [card]);

  useEffect(() => {
    setStarted(false);
    setResult(null);
    setReflection(null);
  }, [card.stateCode]);

  function start() {
    setResult(null);
    setReflection(null);
    setStarted(true);
  }

  return (
    <section className="challenge-view page-panel">
      <div className="challenge-header">
        <div>
          <p className="eyebrow">Fan skill challenge</p>
          <h2>{card.stateName} State Sync Challenge</h2>
          <p>{card.sharedTrait.name}: {card.sharedTrait.description}</p>
        </div>
        <button className="ghost-button" type="button" onClick={onReturn}>Return to State Card</button>
      </div>
      <div className="challenge-grid">
        <section className="challenge-copy">
          <CardArt card={card} compact panelManifest={panelManifest} />
          <p className="state-pill">{card.stateName} - {card.sharedTrait.challengeType.replaceAll("_", " ")}</p>
          <h3>{card.sharedTrait.name}</h3>
          <p>{briefing?.briefing?.gameIntro || `Try a short fan challenge inspired by ${card.sharedTrait.name.toLowerCase()}.`}</p>
          <p className="safe-note">Personal fan result only. This is for appreciation, not measurement or comparison.</p>
          <button className="primary-button wide" type="button" onClick={start}>Start Challenge</button>
        </section>
        <section className="game-surface">
          {!started && !result && <div className="game-status">Press start when you are ready.</div>}
          {started && card.sharedTrait.challengeType === "cadence_keeper" && <CadenceKeeper card={card} onResult={onResult} />}
          {started && card.sharedTrait.challengeType !== "cadence_keeper" && <ReactionGrid card={card} onResult={onResult} />}
          {result && (
            <div className="game-result">
              <p><strong>Personal result:</strong> {result.summary}</p>
              <p>{reflection ? reflection.reflection : "Generating safe game reflection..."}</p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function MiniStateCard({ card, discovered, onSelect, panelManifest }) {
  return (
    <button className={`mini-card ${discovered ? "is-discovered" : "is-locked"}`} type="button" onClick={() => onSelect(card.stateCode)} aria-label={`Open ${card.stateName} card`}>
      <CardArt card={card} compact panelManifest={panelManifest} />
      <div className="mini-card-body">
        <div>
          <strong>{card.sharedTrait.name}</strong>
          <span>{getCardThemeLabel(card)}</span>
        </div>
        <span className={`discover-pill ${discovered ? "is-discovered" : ""}`}>{discovered ? "Discovered" : "Preview"}</span>
      </div>
      <div className="mini-card-signals">
        <span className="signal-mini olympic">Olympic: {titleBucket(card.olympicPanel.aggregateSignal)}</span>
        <span className="signal-mini paralympic">Paralympic: {titleBucket(card.paralympicPanel.aggregateSignal)}</span>
      </div>
    </button>
  );
}

function CollectionView({ states, discoveredCodes, onSelect, panelManifest }) {
  const discoveredStates = states.filter((card) => discoveredCodes.has(card.stateCode));
  const previewStates = states.filter((card) => !discoveredCodes.has(card.stateCode)).slice(0, 12);
  const remaining = states.length - discoveredStates.length;

  return (
    <section className="collection-view page-panel">
      <div className="collection-header">
        <div>
          <p className="eyebrow">Guest collection</p>
          <h2>My Sport Cards</h2>
          <p>Cards appear here after you select states on the map. Exploration stays available without login.</p>
        </div>
        <div className="collection-progress-stack">
          <span className="collection-count">{discoveredStates.length} / {states.length}</span>
          <div className="collection-progress-track" aria-hidden="true">
            <div className="collection-progress-fill" style={{ width: `${Math.round((discoveredStates.length / states.length) * 100)}%` }} />
          </div>
        </div>
      </div>

      <div className="card-grid">
        {discoveredStates.map((card) => (
          <MiniStateCard key={card.stateCode} card={card} discovered onSelect={onSelect} panelManifest={panelManifest} />
        ))}
      </div>

      {previewStates.length > 0 && (
        <>
          <div className="section-divider" />
          <p className="eyebrow muted-eyebrow">Locked — explore on the map to unlock ({remaining} remaining)</p>
          <div className="card-grid compact-grid">
            {previewStates.map((card) => (
              <MiniStateCard key={card.stateCode} card={card} discovered={false} onSelect={onSelect} panelManifest={panelManifest} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function CountsTable({ states, compact = false }) {
  const sorted = [...states].sort((a, b) => a.stateName.localeCompare(b.stateName));
  return (
    <div className={`counts-table-wrap ${compact ? "is-compact" : ""}`}>
      <table className="counts-table">
        <thead>
          <tr>
            <th>State</th>
            <th>Olympic</th>
            <th>Paralympic</th>
            <th>Total</th>
            {!compact && <th>Signal</th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((card) => {
            const counts = getRosterCounts(card);
            return (
              <tr key={card.stateCode}>
                <td>{card.stateName}</td>
                <td>{counts.olympic}</td>
                <td>{counts.paralympic}</td>
                <td>{counts.total}</td>
                {!compact && <td>{titleBucket(card.hometownPresenceBucket)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MethodologyView({ refs, meta, states }) {
  return (
    <section className="methodology-view page-panel">
      <div className="methodology-hero">
        <p className="eyebrow">Rules-aware build notes</p>
        <h2>Methodology and Compliance</h2>
        <p>{meta.datasetLabel} The app keeps Olympic and Paralympic sport families in one shared state view, uses aggregate buckets, and avoids athlete-level output.</p>
      </div>
      <div className="method-grid">
        <section>
          <h3>Data Policy</h3>
          <ul>
            <li>The aggregate dataset is derived from public TeamUSA.com Paris 2024 source records: Olympic {meta.sourceProgramRecordTotals?.olympic}, Paralympic {meta.sourceProgramRecordTotals?.paralympic}.</li>
            <li>Records with U.S. hometown geography fields after excluding blank or unsupported values: Olympic {meta.stateCodedRecordTotals?.olympic}, Paralympic {meta.stateCodedRecordTotals?.paralympic}.</li>
            <li>No athlete names, images, finish times, individual cards, rankings, or protected marks are included.</li>
            <li>{meta.bucketPolicy}</li>
          </ul>
        </section>
        <section>
          <h3>Map Stack</h3>
          <ul>
            <li>React renders the app state and view composition.</li>
            <li>D3 creates SVG paths from Census-derived TopoJSON geometry.</li>
            <li>TopoJSON keeps the state boundary file compact for fast local testing.</li>
          </ul>
        </section>
        <section>
          <h3>Gemini Usage</h3>
          <ul>
            <li>Gemini generation happens through server-side API routes.</li>
            <li>If no Gemini key is configured, the app uses compliant fallback copy.</li>
            <li>Local validation replaces unsafe model text before display.</li>
          </ul>
        </section>
        <section>
          <h3>Parity Rules</h3>
          <ul>
            <li>Olympic and Paralympic panels are always visible together.</li>
            <li>Both panels use the same fields, type scale, source treatment, and visual weight.</li>
            <li>No separate control splits Paralympic content away from Olympic content.</li>
          </ul>
        </section>
      </div>
      <section className="source-panel">
        <h3>Coverage Notes</h3>
        <p>{meta.coverageNote}</p>
        <p>Excluded source records: Olympic {formatExcludedRows(meta.excludedRowsByProgram?.olympic)}; Paralympic {formatExcludedRows(meta.excludedRowsByProgram?.paralympic)}.</p>
      </section>
      <section className="source-panel">
        <h3>Official Counts Breakdown</h3>
        <p>Counts reflect sourced TeamUSA.com Paris 2024 public roster records with supported U.S. hometown geography fields, not a complete historical athlete census.</p>
        <CountsTable states={states} />
      </section>
      <section className="source-panel">
        <h3>Source Labels</h3>
        <SourceList refs={refs} />
      </section>
    </section>
  );
}

function AppShell({ view, setView, children, onNavigate, onLogin, darkMode, onToggleDarkMode }) {
  return (
    <div className="app-frame-v2">
      <TopNav
        page="app"
        view={view}
        onViewChange={(nextView) => setView(nextView)}
        onNavigate={onNavigate}
        onLogin={onLogin}
        darkMode={darkMode}
        onToggleDarkMode={onToggleDarkMode}
      />
      <div className="workspace-v2">
        <main>{children}</main>
      </div>
    </div>
  );
}

function App() {
  const [page, setPage] = useState("landing");
  const [darkMode, setDarkMode] = useState(true);
  const [dataset, setDataset] = useState(null);
  const [mapTopology, setMapTopology] = useState(null);
  const [geoTopology, setGeoTopology] = useState(null);
  const [selectedCode, setSelectedCode] = useState("CO");
  const [briefing, setBriefing] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [view, setView] = useState("explorer");
  const [loadError, setLoadError] = useState(null);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [discoveredCodes, setDiscoveredCodes] = useState(() => new Set(["CO"]));
  const [panelManifest, setPanelManifest] = useState(EMPTY_CARD_PANEL_MANIFEST);

  /*
  Card lab state, parked while the selected experience is locked:
  const [openAnimationIndex, setOpenAnimationIndex] = useState(() => readPresetIndex("common-ground-card-open-animation", CARD_OPEN_PRESETS));
  const [interactionIndex, setInteractionIndex] = useState(() => readPresetIndex("common-ground-card-interaction", CARD_INTERACTION_PRESETS));
  const [cardLayoutIndex, setCardLayoutIndex] = useState(() => readPresetIndex("common-ground-card-layout", CARD_LAYOUT_PRESETS));
  const openAnimation = CARD_OPEN_PRESETS[openAnimationIndex] || CARD_OPEN_PRESETS[0];
  const interaction = CARD_INTERACTION_PRESETS[interactionIndex] || CARD_INTERACTION_PRESETS[0];
  const cardLayout = CARD_LAYOUT_PRESETS[cardLayoutIndex] || CARD_LAYOUT_PRESETS[0];
  */

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("common-ground-discovered") || "[]");
      if (Array.isArray(saved) && saved.length) setDiscoveredCodes(new Set(saved));
    } catch {
      setDiscoveredCodes(new Set(["CO"]));
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("common-ground-discovered", JSON.stringify([...discoveredCodes]));
    } catch {
      // Local storage is optional for the guest collection.
    }
  }, [discoveredCodes]);

  useEffect(() => {
    document.documentElement.dataset.theme = ACTIVE_VISUAL_THEME.color;
    document.documentElement.dataset.surface = darkMode ? "blacktop" : "";
    document.documentElement.dataset.type = ACTIVE_VISUAL_THEME.type;
  }, [darkMode]);

  /*
  Card lab persistence, parked with the toggle UI:
  useEffect(() => {
    try {
      window.localStorage.setItem("common-ground-card-open-animation", openAnimation.id);
    } catch {
      // Card open animation persistence is optional.
    }
  }, [openAnimation.id]);

  useEffect(() => {
    try {
      window.localStorage.setItem("common-ground-card-interaction", interaction.id);
    } catch {
      // Card interaction persistence is optional.
    }
  }, [interaction.id]);

  useEffect(() => {
    try {
      window.localStorage.setItem("common-ground-card-layout", cardLayout.id);
    } catch {
      // Card layout persistence is optional.
    }
  }, [cardLayout.id]);
  */

  useEffect(() => {
    Promise.all([
      getJson("/data/state-cards.json"),
      getJson("/data/us-states-albers-10m.json"),
      getJson("/data/us-states-geographic-10m.json"),
      getJson("/assets/card-panels/manifest.json").catch(() => EMPTY_CARD_PANEL_MANIFEST)
    ])
      .then(([nextDataset, nextMapTopology, nextGeoTopology, nextPanelManifest]) => {
        setDataset(nextDataset);
        setMapTopology(nextMapTopology);
        setGeoTopology(nextGeoTopology);
        setPanelManifest(nextPanelManifest || EMPTY_CARD_PANEL_MANIFEST);
      })
      .catch((error) => setLoadError(error.message));
  }, []);

  const cardsByCode = useMemo(() => new Map((dataset?.states || []).map((card) => [card.stateCode, card])), [dataset]);
  const selectedBaseCard = cardsByCode.get(selectedCode) || dataset?.states?.[0];
  const selectedCard = useMemo(
    () => selectedBaseCard ? mergeGeneratedPanelData(selectedBaseCard, panelManifest) : selectedBaseCard,
    [selectedBaseCard, panelManifest]
  );
  const sourceRefs = selectedCard && dataset ? uniqueSourceRefs([...(dataset.meta.sourceRefs || []), ...(selectedCard.sourceRefs || [])]) : [];
  const features = useMemo(() => {
    if (!mapTopology) return [];
    return feature(mapTopology, mapTopology.objects.states).features.map((item) => ({
      ...item,
      properties: {
        ...item.properties,
        stateCode: FIPS_TO_CODE[String(item.id).padStart(2, "0")] || ""
      }
    }));
  }, [mapTopology]);
  const geoFeatures = useMemo(() => {
    if (!geoTopology) return [];
    return feature(geoTopology, geoTopology.objects.states).features.map((item) => ({
      ...item,
      properties: {
        ...item.properties,
        stateCode: FIPS_TO_CODE[String(item.id).padStart(2, "0")] || ""
      }
    }));
  }, [geoTopology]);

  async function refreshBriefing(card = selectedCard) {
    if (!card) return;
    setBriefingLoading(true);
    try {
      const payload = await getJson("/api/gemini/state-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stateSyncCardJson: card })
      });
      setBriefing(payload);
    } catch (error) {
      setBriefing(fallbackBriefing(card, error.message));
    } finally {
      setBriefingLoading(false);
    }
  }

  useEffect(() => {
    if (selectedCard) refreshBriefing(selectedCard);
  }, [selectedCode, dataset, panelManifest]);

  function markDiscovered(code) {
    setDiscoveredCodes((current) => {
      const next = new Set(current);
      next.add(code);
      return next;
    });
  }

  function selectState(code, nextView = "explorer", openCard = true) {
    setSelectedCode(code);
    markDiscovered(code);
    setView(nextView);
    setIsCardModalOpen(openCard);
  }

  function navigate(nextPage, nextView = null) {
    setPage(nextPage);
    if (nextView) setView(nextView);
    setIsCardModalOpen(false);
  }

  const navProps = {
    onNavigate: navigate,
    onLogin: () => navigate("login"),
    darkMode,
    onToggleDarkMode: () => setDarkMode((d) => !d)
  };

  if (page === "landing") {
    return <LandingPage {...navProps} />;
  }

  if (page === "login") {
    return <LoginPage {...navProps} onLogin={() => navigate("app")} />;
  }

  if (loadError) {
    return (
      <main className="load-state">
        <h1>Common Ground could not start.</h1>
        <p>{loadError}</p>
      </main>
    );
  }

  if (!dataset || !mapTopology || !geoTopology || !selectedCard) {
    return (
      <div className="app-frame-v2">
        <TopNav page="app" view={view} onViewChange={setView} {...navProps} />
        <main className="load-state">
          <p>Loading map and sourced state aggregates...</p>
        </main>
      </div>
    );
  }

  return (
    <AppShell
      view={view}
      setView={(nextView) => {
        setIsCardModalOpen(false);
        setView(nextView);
      }}
      {...navProps}
    >
      {view === "explorer" && (
        <section className="map-explorer-shell">
          <section className="map-surface page-panel" aria-labelledby="mapTitle">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Geography-powered fan discovery</p>
                <h2 id="mapTitle">State Atlas</h2>
              </div>
            </div>
            <p className="safe-note">Explore aggregate state signals from public Team USA and geography data. Patterns may suggest fan-discovery context and do not imply performance outcomes.</p>
            <StateMap mapTopology={mapTopology} features={features} geoFeatures={geoFeatures} cardsByCode={cardsByCode} selectedCode={selectedCode} onSelect={selectState} discoveredCodes={discoveredCodes} totalStates={dataset.states.length} />
          </section>
        </section>
      )}

      {view === "collection" && (
        <CollectionView states={dataset.states} discoveredCodes={discoveredCodes} onSelect={(code) => selectState(code, "collection")} panelManifest={panelManifest} />
      )}

      {view === "challenge" && (
        <ChallengeView card={selectedCard} briefing={briefing} onReturn={() => setView("explorer")} panelManifest={panelManifest} />
      )}

      {view === "methodology" && <MethodologyView refs={dataset.meta.sourceRefs || []} meta={dataset.meta} states={dataset.states} />}

      {isCardModalOpen && (
        <CardModal
          card={selectedCard}
          sourceRefs={sourceRefs}
          briefing={briefing}
          briefingLoading={briefingLoading}
          onRefreshBriefing={() => refreshBriefing(selectedCard)}
          onOpenChallenge={() => {
            setIsCardModalOpen(false);
            setView("challenge");
          }}
          onClose={() => setIsCardModalOpen(false)}
          panelManifest={panelManifest}
        />
      )}
    </AppShell>
  );
}

const rootElement = document.getElementById("root");
const root = window.__COMMON_GROUND_ROOT__ || createRoot(rootElement);
window.__COMMON_GROUND_ROOT__ = root;
root.render(<AppErrorBoundary><App /></AppErrorBoundary>);
