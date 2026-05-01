import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { geoContains, geoPath } from "d3-geo";
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
  "56": "WY"
};

const VIEW_LABELS = {
  explorer: "Map Explorer",
  collection: "My Sport Cards",
  challenge: "Trait Challenge",
  methodology: "Methodology"
};

const CARD_ART = {
  aquatic: "/assets/card-art/aquatic.png",
  "control-pressure": "/assets/card-art/control-pressure.png",
  neutral: "/assets/card-art/neutral-signal.png",
  "rhythm-pace": "/assets/card-art/rhythm-pace.png",
  "spatial-timing": "/assets/card-art/spatial-timing.png",
  "winter-endurance": "/assets/card-art/winter-endurance.png"
};

const EMPTY_CARD_PANEL_MANIFEST = { states: {} };

function titleBucket(bucket) {
  return String(bucket || "insufficient_data").replaceAll("_", " ");
}

async function getJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function fallbackBriefing(card, reason = "The Gemini backend is not available from this dev server.") {
  return {
    source: "react-fallback",
    model: "safe-fallback",
    briefing: {
      summary: `Public Team USA roster data may suggest that ${card.stateName} is useful for exploring ${card.sharedTrait.name.toLowerCase()} across Olympic and Paralympic sport families. The geography notes could help fans understand the state context without implying performance outcomes.`,
      olympicNarrative: `${card.olympicPanel.sportFamily} appears in the Olympic panel as an aggregate sport-family signal. ${card.olympicPanel.geographyConnection}`,
      paralympicNarrative: `${card.paralympicPanel.sportFamily} appears in the Paralympic panel as an aggregate sport-family signal. ${card.paralympicPanel.geographyConnection}`,
      sharedTraitExplanation: `${card.sharedTrait.name} connects the two panels through ${card.sharedTrait.description.toLowerCase()}`,
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
  return `${card.stateName}: Olympic ${counts.olympic}, Paralympic ${counts.paralympic}, total ${counts.total} public hometown-state roster rows. Signal: ${titleBucket(card.hometownPresenceBucket)}.`;
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

function shortProgramName(program) {
  return program === "paralympic" ? "Paralympic" : "Olympic";
}

function getPanelArtUrl(card, program, manifest) {
  const panel = manifest?.states?.[card.stateCode]?.[program];
  if (panel?.url) return panel.url;
  const theme = getCardTheme(card);
  return CARD_ART[theme] || CARD_ART.neutral;
}

function AppIcon({ name }) {
  return <span className={`nav-glyph nav-glyph-${name}`} aria-hidden="true" />;
}

function SignalLegend() {
  return (
    <div className="legend" aria-label="Participation signal legend">
      <span><i className="signal-dot high" />High</span>
      <span><i className="signal-dot medium" />Medium</span>
      <span><i className="signal-dot low" />Low</span>
      <span><i className="signal-dot insufficient_data" />Insufficient data</span>
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
      <span>Olympic {counts.olympic}</span>
      <span>Paralympic {counts.paralympic}</span>
      <span>Total {counts.total}</span>
    </div>
  );
}

function LocateIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 7h7a5 5 0 1 1-4.2 7.7" />
      <path d="M7 7V3M7 7h4" />
    </svg>
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

function StateMap({ mapTopology, features, geoFeatures, cardsByCode, selectedCode, onSelect }) {
  const [hint, setHint] = useState("Hover or focus a state to preview its participation signal.");
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
      setHint("Browser location is not available here. You can still select a state from the list.");
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
          setHint(`Your browser location matched ${matchedFeature.properties.name}, but no 50-state card is loaded for it.`);
        } else {
          setHint("Could not match the browser location to a U.S. state boundary.");
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
      setHint(`${item.properties.name}: real map boundary shown. No U.S. state card is loaded for this geography.`);
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
            <LocateIcon />
          </button>
          <button className="map-control-button" type="button" onClick={zoomOut} aria-label="Zoom out" title="Zoom out">-</button>
          <button className="map-control-button" type="button" onClick={resetMap} aria-label="Reset map" title="Reset map">
            <ResetIcon />
          </button>
        </div>
        <svg
          ref={svgRef}
          className={`state-map ${isDragging ? "is-dragging" : ""}`}
          viewBox="0 0 975 610"
          role="img"
          aria-label="Actual U.S. state boundary map with selectable sourced aggregate states"
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
                const signal = card?.hometownPresenceBucket || "insufficient_data";
                const className = [
                  "state-path",
                  card ? "has-data" : "no-data",
                  signal,
                  code === selectedCode ? "is-selected" : ""
                ].filter(Boolean).join(" ");

                return (
                  <path
                    key={item.id}
                    className={className}
                    d={path(item)}
                    data-state-code={code}
                    role={card ? "button" : "img"}
                    tabIndex={card ? 0 : -1}
                    aria-label={card ? `${card.stateName}, Olympic ${getRosterCounts(card).olympic}, Paralympic ${getRosterCounts(card).paralympic}, total ${getRosterCounts(card).total} public hometown-state roster rows` : `${item.properties.name}, no state card loaded`}
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
            {selectedCentroid && viewport.scale < 2.9 && (
              <text className="selected-state-label" x={selectedCentroid[0]} y={selectedCentroid[1]}>
                {selectedCode}
              </text>
            )}
          </g>
          <text className="map-small-label" x="487" y="590">Actual U.S. state boundaries from us-atlas TopoJSON</text>
        </svg>
        <RosterTooltip card={hoverTip?.card} position={hoverTip?.position} />
        <div className="map-hint">{hint}</div>
      </div>
      <SignalLegend />
    </>
  );
}

function StateControls({ states, selectedCode, onSelect }) {
  return (
    <div className="state-controls">
      <label className="select-label">
        Select state
        <select value={selectedCode} onChange={(event) => onSelect(event.target.value)}>
          {states.map((card) => (
            <option key={card.stateCode} value={card.stateCode}>{card.stateName}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function StateSummary({ card }) {
  const counts = getRosterCounts(card);

  return (
    <section className="state-summary">
      <div>
        <p className="eyebrow">Selected state</p>
        <h2>{card.stateName}</h2>
      </div>
      <p>{card.geographySnapshot}</p>
      <div className="metric-row">
        <span className="metric">Hometown presence <strong>{titleBucket(card.hometownPresenceBucket)}</strong></span>
        <span className="metric">Olympic rows <strong>{counts.olympic}</strong></span>
        <span className="metric">Paralympic rows <strong>{counts.paralympic}</strong></span>
      </div>
      <div className="chip-row">
        {card.terrainSignals.map((item) => <span className="chip" key={item}>{item}</span>)}
      </div>
    </section>
  );
}

function SportPanel({ panel }) {
  return (
    <section className="panel">
      <div className="panel-label">
        <span className={`program-tag ${panel.program}`}>{panel.label}</span>
        <span className="signal-tag">{titleBucket(panel.aggregateSignal)} signal</span>
      </div>
      <div className="panel-body">
        <h4>{panel.sportFamily}</h4>
        <p>{panel.geographyConnection}</p>
        <p>{panel.geminiNote || "Gemini note will appear after briefing generation."}</p>
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
  const counts = getRosterCounts(card);
  const olympicSrc = getPanelArtUrl(card, "olympic", panelManifest);
  const paralympicSrc = getPanelArtUrl(card, "paralympic", panelManifest);

  return (
    <div className={`card-art card-art-${theme} ${compact ? "is-compact" : ""}`}>
      <div className="card-art-stack">
        <div className="card-art-panel olympic-art-panel">
          <PanelArtImage src={olympicSrc} fallback={fallback} />
          <div className="art-vignette" />
          <span className="art-panel-label">{shortProgramName(card.olympicPanel.program)}</span>
          {!compact && <strong className="art-panel-sport">{card.olympicPanel.sportFamily}</strong>}
        </div>
        <div className="card-art-panel paralympic-art-panel">
          <PanelArtImage src={paralympicSrc} fallback={fallback} />
          <div className="art-vignette" />
          <span className="art-panel-label">{shortProgramName(card.paralympicPanel.program)}</span>
          {!compact && <strong className="art-panel-sport">{card.paralympicPanel.sportFamily}</strong>}
        </div>
        <CommonGroundSeal />
      </div>
      <div className="art-state-lockup">
        <strong>{card.stateName}</strong>
        <span>{compact ? card.sharedTrait.name : "State Sync Challenge"}</span>
        {!compact && <em>{counts.olympic} Olympic · {counts.paralympic} Paralympic public roster rows</em>}
      </div>
    </div>
  );
}

function UnifiedStateCard({ card, sourceRefs, briefing, briefingLoading, onRefreshBriefing, onOpenChallenge, onFlipChange, panelManifest }) {
  const [flipped, setFlipped] = useState(false);
  const counts = getRosterCounts(card);

  useEffect(() => {
    setFlipped(false);
    onFlipChange?.(false);
  }, [card.stateCode]);

  function toggleFlip() {
    setFlipped((value) => {
      const next = !value;
      onFlipChange?.(next);
      return next;
    });
  }

  return (
    <section className="sports-card-shell">
      <div className={`sports-card ${flipped ? "is-flipped" : ""}`}>
        <article className="sports-card-face sports-card-front" aria-label={`${card.stateName} state card front`}>
          <CardArt card={card} panelManifest={panelManifest} />
        </article>

        <article className="sports-card-face sports-card-back" aria-label={`${card.stateName} state card data`}>
          <div className="card-back-scroll">
            <div className="card-header">
              <p className="eyebrow">Shared geography view</p>
              <h3>{card.stateName}</h3>
              <p>{card.geographySnapshot}</p>
              <div className="metric-row compact-metrics">
                <span className="metric">Signal <strong>{titleBucket(card.hometownPresenceBucket)}</strong></span>
                <span className="metric">Olympic rows <strong>{counts.olympic}</strong></span>
                <span className="metric">Paralympic rows <strong>{counts.paralympic}</strong></span>
              </div>
            </div>
            <div className="program-panel-grid">
              <SportPanel panel={card.olympicPanel} />
              <SportPanel panel={card.paralympicPanel} />
            </div>
            <section className="trait-band">
              <div className="trait-badge">
                <span>Shared trait</span>
                <strong>{card.sharedTrait.name}</strong>
              </div>
              <p>{card.sharedTrait.description}</p>
            </section>
            <BriefingPanel payload={briefing} loading={briefingLoading} onRefresh={onRefreshBriefing} compact />
            <div className="card-footer">
              <SourceList refs={sourceRefs} />
              <button className="primary-button" type="button" onClick={onOpenChallenge}>Try the State Sync Challenge</button>
            </div>
          </div>
        </article>
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

function CardModal({ card, sourceRefs, briefing, briefingLoading, onRefreshBriefing, onOpenChallenge, onClose, panelManifest }) {
  const [isBackExpanded, setIsBackExpanded] = useState(false);

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
      <div className={`card-modal-panel ${isBackExpanded ? "is-back-expanded" : ""}`}>
        <div className="modal-topline">
          <div>
            <p className="eyebrow">Discovered state card</p>
            <h2>{card.stateName}</h2>
          </div>
          <button className="modal-close-button" type="button" onClick={onClose} aria-label="Close state card">x</button>
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

  const warnings = payload.complianceWarnings || payload.briefing.complianceWarnings || [];
  return (
    <section className={`briefing-panel ${compact ? "is-compact" : ""}`}>
      <div className="panel-heading-row">
        <h3>Gemini State Briefing</h3>
        <button className="ghost-button small" type="button" onClick={onRefresh}>Refresh</button>
      </div>
      <p>{payload.briefing.summary}</p>
      <div className="briefing-split">
        <p><strong>Olympic panel:</strong> {payload.briefing.olympicNarrative}</p>
        <p><strong>Paralympic panel:</strong> {payload.briefing.paralympicNarrative}</p>
      </div>
      <p><strong>Shared trait:</strong> {payload.briefing.sharedTraitExplanation}</p>
      <div className="briefing-meta">
        <span>Source: {payload.source}</span>
        <span>Model: {payload.model}</span>
        <span>Warnings: {warnings.length}</span>
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
          <p className="safe-note">This is a personal fan-game result only. It is for appreciation, not measurement or comparison.</p>
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
              {reflection && (
                <div className="briefing-meta">
                  <span>Model: {reflection.model}</span>
                  <span>Warnings: {(reflection.warnings || []).length}</span>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function MiniStateCard({ card, discovered, onSelect, panelManifest }) {
  const counts = getRosterCounts(card);
  return (
    <button className="mini-card" type="button" onClick={() => onSelect(card.stateCode)} aria-label={`Open ${card.stateName} card`}>
      <CardArt card={card} compact panelManifest={panelManifest} />
      <div className="mini-card-body">
        <div>
          <strong>{card.stateName}</strong>
          <span>{card.sharedTrait.name}</span>
        </div>
        <span className={`discover-pill ${discovered ? "is-discovered" : ""}`}>{discovered ? "Discovered" : "Preview"}</span>
      </div>
      <div className="mini-card-counts">
        <span>Olympic {counts.olympic}</span>
        <span>Paralympic {counts.paralympic}</span>
      </div>
    </button>
  );
}

function CollectionView({ states, discoveredCodes, onSelect, panelManifest }) {
  const discoveredStates = states.filter((card) => discoveredCodes.has(card.stateCode));
  const previewStates = states.filter((card) => !discoveredCodes.has(card.stateCode)).slice(0, 8);

  return (
    <section className="collection-view page-panel">
      <div className="collection-header">
        <div>
          <p className="eyebrow">Guest collection</p>
          <h2>My Sport Cards</h2>
          <p>Cards appear here after you select states on the map. Exploration stays available without login.</p>
        </div>
        <span className="collection-count">{discoveredStates.length} discovered</span>
      </div>

      <div className="card-grid">
        {discoveredStates.map((card) => (
          <MiniStateCard key={card.stateCode} card={card} discovered onSelect={onSelect} panelManifest={panelManifest} />
        ))}
      </div>

      {previewStates.length > 0 && (
        <>
          <div className="section-divider" />
          <p className="eyebrow muted-eyebrow">More sourced state cards</p>
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
            <li>Frontend data is generated from public TeamUSA.com Paris 2024 roster source rows: Olympic {meta.sourceProgramRecordTotals?.olympic}, Paralympic {meta.sourceProgramRecordTotals?.paralympic}.</li>
            <li>State-coded rows after excluding blank or non-state hometown fields: Olympic {meta.stateCodedRecordTotals?.olympic}, Paralympic {meta.stateCodedRecordTotals?.paralympic}.</li>
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
        <p>Excluded rows: Olympic {formatExcludedRows(meta.excludedRowsByProgram?.olympic)}; Paralympic {formatExcludedRows(meta.excludedRowsByProgram?.paralympic)}.</p>
      </section>
      <section className="source-panel">
        <h3>Official Counts Breakdown</h3>
        <p>Counts are sourced TeamUSA.com Paris 2024 public roster rows with U.S. hometown-state fields, not a complete historical athlete census.</p>
        <CountsTable states={states} />
      </section>
      <section className="source-panel">
        <h3>Source Labels</h3>
        <SourceList refs={refs} />
      </section>
    </section>
  );
}

function AppShell({ view, setView, children }) {
  const navItems = [
    ["explorer", "map"],
    ["collection", "cards"],
    ["challenge", "game"],
    ["methodology", "method"]
  ];

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand-block">
          <h1>Common Ground</h1>
          <p>Geography-powered fan discovery</p>
        </div>
        <nav className="side-nav" aria-label="Primary">
          {navItems.map(([key, icon]) => (
            <button
              key={key}
              className={`side-nav-button ${view === key ? "is-active" : ""}`}
              type="button"
              onClick={() => setView(key)}
            >
              <AppIcon name={icon} />
              <span>{VIEW_LABELS[key]}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="workspace">
        <main>{children}</main>
      </div>
    </div>
  );
}

function App() {
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
  const selectedCard = cardsByCode.get(selectedCode) || dataset?.states?.[0];
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
  }, [selectedCode, dataset]);

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
      <main className="load-state">
        <h1>Common Ground</h1>
        <p>Loading map and sourced state aggregates...</p>
      </main>
    );
  }

  return (
    <AppShell
      view={view}
      setView={(nextView) => {
        setIsCardModalOpen(false);
        setView(nextView);
      }}
    >
      {view === "explorer" && (
        <section className="map-explorer-shell">
          <section className="map-surface page-panel" aria-labelledby="mapTitle">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Geography-powered fan discovery</p>
                <h2 id="mapTitle">State Signal Map</h2>
              </div>
              <StateControls states={dataset.states} selectedCode={selectedCode} onSelect={selectState} />
            </div>
            <p className="safe-note">Explore aggregate state signals generated from public TeamUSA.com Paris 2024 roster data. Patterns are for fan discovery and do not imply performance outcomes.</p>
            <StateMap mapTopology={mapTopology} features={features} geoFeatures={geoFeatures} cardsByCode={cardsByCode} selectedCode={selectedCode} onSelect={selectState} />
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
