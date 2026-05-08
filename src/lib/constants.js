export const FIPS_TO_CODE = {
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

export const VIEW_LABELS = {
  explorer: "Map Explorer",
  collection: "My Sport Cards",
  challenge: "Fan Challenge",
  methodology: "Methodology"
};

export const ACTIVE_VISUAL_THEME = {
  color: "midnight-sand",
  surface: "blacktop",
  type: "scoreboard"
};

export const CARD_OPEN_PRESETS = [
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

export const CARD_INTERACTION_PRESETS = [
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

export const CARD_LAYOUT_PRESETS = [
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

export const ACTIVE_CARD_EXPERIENCE = {
  openAnimation: CARD_OPEN_PRESETS.find((preset) => preset.id === "spotlight-bloom") || CARD_OPEN_PRESETS[0],
  interaction: CARD_INTERACTION_PRESETS.find((preset) => preset.id === "press-lift") || CARD_INTERACTION_PRESETS[0],
  cardLayout: CARD_LAYOUT_PRESETS.find((preset) => preset.id === "tabletop") || CARD_LAYOUT_PRESETS[0]
};

export const CARD_ART = {
  aquatic: "/assets/card-art/aquatic.png",
  "control-pressure": "/assets/card-art/control-pressure.png",
  neutral: "/assets/card-art/neutral-signal.png",
  "rhythm-pace": "/assets/card-art/rhythm-pace.png",
  "spatial-timing": "/assets/card-art/spatial-timing.png",
  "winter-endurance": "/assets/card-art/winter-endurance.png"
};

export const FRAMED_CARD_PANEL_PROMPT_VERSIONS = new Set(["common-ground-card-panel-v2"]);

export const CARD_THEME_LABELS = {
  aquatic: "Water sport card",
  "control-pressure": "Control pressure card",
  neutral: "Open signal card",
  "rhythm-pace": "Pace control card",
  "spatial-timing": "Spatial timing card",
  "winter-endurance": "Alpine endurance card"
};

export const EMPTY_CARD_PANEL_MANIFEST = { states: {} };
export const CURRENT_CARD_BACK_COPY_VERSION = "common-ground-card-back-v14-basic-rules";
export const CURRENT_GAME_EXPERIENCE_VERSION = "common-ground-game-experience-v3-shared-trait-examples";
export const SUPPORTED_GAME_EXPERIENCE_VERSIONS = new Set([
  CURRENT_GAME_EXPERIENCE_VERSION,
  "common-ground-game-experience-v2-style-references",
  "common-ground-game-experience-v1"
]);
export const GAME_TYPE_LABELS = {
  reaction_grid: "Focus Window",
  cadence_keeper: "Rhythm Shift",
  precision_trace: "Precision Trace",
  focus_hold: "Open Space",
  pattern_scout: "Pattern Scout"
};

export const SIGNAL_LABELS = {
  high: "High",
  medium: "Medium",
  low: "Low",
  insufficient_data: "Limited"
};

export const PANEL_QA_ROWS = [
  ["howItWorks", "How it works"],
  ["watchValue", "Why it's fun to watch"],
  ["stateConnection", "State connection"]
];
