import React, { useEffect, useMemo, useRef, useState } from "react";
import { geoContains, geoMercator, geoPath } from "d3-geo";
import { mesh } from "topojson-client";
import Icon from "../common/Icon.jsx";
import { getRosterCounts, formatMapHint } from "../../lib/stateCard.js";

function SignalLegend() {
  return (
    <div className="legend" aria-label="Athlete hometown representation legend">
      <span className="legend-item"><i className="signal-dot high" /><span>High representation</span></span>
      <span className="legend-item"><i className="signal-dot medium" /><span>Medium</span></span>
      <span className="legend-item"><i className="signal-dot low" /><span>Low</span></span>
      <span className="legend-item"><i className="signal-dot no-athletes" /><span>No athletes</span></span>
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

const TERRITORY_INSET = {
  x: 956,
  y: 456,
  width: 146,
  height: 118,
  gap: 18,
  paddingX: 12,
  paddingY: 10
};

function RosterTooltip({ card, position }) {
  if (!card || !position) return null;
  const counts = getRosterCounts(card);
  const hasAthletes = counts.total > 0;

  return (
    <div
      className="map-tooltip"
      style={{ "--tooltip-x": `${position.x}px`, "--tooltip-y": `${position.y}px` }}
      aria-hidden="true"
    >
      <strong>{card.stateName}</strong>
      {hasAthletes ? (
        <>
          <span>Olympic athletes: {counts.olympic}</span>
          <span>Paralympic athletes: {counts.paralympic}</span>
          <span>Total: {counts.total}</span>
        </>
      ) : (
        <span>No athletes in this dataset</span>
      )}
    </div>
  );
}

function StateMap({ mapTopology, features, geoFeatures, cardsByCode, selectedCode, onSelect, discoveredCodes = new Set(), totalStates = 0, showCompleted = false, onToggleCompleted, dataScopeOptions = [], activeDataScope = "both", onDataScopeChange }) {
  const [hint, setHint] = useState("Select or focus a state to preview Team USA athlete hometown counts and sport presence.");
  const [hoverTip, setHoverTip] = useState(null);
  const [viewport, setViewport] = useState({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const pinchRef = useRef(null);
  const viewportRef = useRef(viewport);
  const suppressClickRef = useRef(false);
  const filterRef = useRef(null);
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
  const territoryLayouts = useMemo(() => {
    return territoryFeatures.map((item) => {
      const collection = { type: "FeatureCollection", features: [item] };
      const projection = geoMercator().fitExtent(
        [
          [TERRITORY_INSET.paddingX, TERRITORY_INSET.paddingY],
          [TERRITORY_INSET.width - TERRITORY_INSET.paddingX, TERRITORY_INSET.height - TERRITORY_INSET.paddingY]
        ],
        collection
      );
      return {
        item,
        path: geoPath(projection)
      };
    });
  }, [territoryFeatures]);
  const selectedCard = cardsByCode.get(selectedCode);

  useEffect(() => {
    if (selectedCard) setHint(formatMapHint(selectedCard));
  }, [selectedCard]);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    if (!filterOpen) return;
    function handleClick(e) {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [filterOpen]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function onWheel(event) {
      event.preventDefault();
      const anchor = clientToViewBox(event.clientX, event.clientY);
      const direction = event.deltaY < 0 ? 1 : -1;
      const step = event.ctrlKey || event.metaKey ? 0.28 : 0.18;
      zoomAtViewBoxPoint(anchor, viewportRef.current.scale + direction * step);
    }
    svg.addEventListener("wheel", onWheel, { passive: false });

    function onTouchStart(e) {
      if (e.touches.length === 2) {
        e.preventDefault();
        dragRef.current = null;
        setIsDragging(false);
        const [t1, t2] = [e.touches[0], e.touches[1]];
        pinchRef.current = {
          distance: getTouchDistance(t1, t2),
          midpoint: getTouchMidpoint(t1, t2),
          viewport: { ...viewportRef.current },
        };
        return;
      }
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      startDrag(t.clientX, t.clientY);
    }
    function onTouchMove(e) {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const [t1, t2] = [e.touches[0], e.touches[1]];
        const newDist = getTouchDistance(t1, t2);
        const newMid = getTouchMidpoint(t1, t2);
        const { distance: initDist, midpoint: initMid, viewport: initVp } = pinchRef.current;
        const ratio = newDist / initDist;
        const newScale = clampScale(initVp.scale * ratio);
        const initAnchor = clientToViewBox(initMid.x, initMid.y);
        const mapX = (initAnchor.x - initVp.x) / initVp.scale;
        const mapY = (initAnchor.y - initVp.y) / initVp.scale;
        const curAnchor = clientToViewBox(newMid.x, newMid.y);
        suppressClickRef.current = true;
        setViewport({
          scale: newScale,
          x: curAnchor.x - mapX * newScale,
          y: curAnchor.y - mapY * newScale,
        });
        return;
      }
      if (!dragRef.current) return;
      e.preventDefault();
      const t = e.touches[0];
      updateDrag(t.clientX, t.clientY);
    }
    function onTouchEnd(e) {
      if (!e || e.touches.length < 2) pinchRef.current = null;
      if (!e || e.touches.length === 0) endDrag();
    }
    svg.addEventListener("touchstart", onTouchStart, { passive: false });
    svg.addEventListener("touchmove", onTouchMove, { passive: false });
    svg.addEventListener("touchend", onTouchEnd);
    svg.addEventListener("touchcancel", onTouchEnd);

    return () => {
      svg.removeEventListener("wheel", onWheel);
      svg.removeEventListener("touchstart", onTouchStart);
      svg.removeEventListener("touchmove", onTouchMove);
      svg.removeEventListener("touchend", onTouchEnd);
      svg.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

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

  function getTouchDistance(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getTouchMidpoint(t1, t2) {
    return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
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

  function isInteractiveMapTarget(target) {
    return target instanceof Element && Boolean(target.closest(".state-path.has-data, .territory-inset"));
  }

  function handlePointerDown(event) {
    if (event.pointerType === "touch") return;
    if (event.button !== 0) return;
    if (isInteractiveMapTarget(event.target)) return;
    const started = startDrag(event.clientX, event.clientY);
    if (!started) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    if (event.pointerType === "touch") return;
    updateDrag(event.clientX, event.clientY);
  }

  function handlePointerEnd(event) {
    if (event.pointerType === "touch") return;
    endDrag();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  return (
    <>
      <div className="map-outer">
        <div className="map-wrap">
        <svg
          ref={svgRef}
          className={`state-map ${isDragging ? "is-dragging" : ""}`}
          viewBox="0 0 975 610"
          role="img"
          aria-label="Interactive U.S. map. Select a state to explore Team USA athlete hometown patterns."
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
                const noAthletes = counts.total === 0;
                const className = [
                  "state-path",
                  card ? "has-data" : "no-data",
                  noAthletes ? "no-athletes" : signal,
                  code === selectedCode ? "is-selected" : "",
                  discoveredCodes.has(code) ? "is-discovered" : ""
                ].filter(Boolean).join(" ");

                return (
                  <path
                    key={item.id}
                    className={className}
                    d={path(item)}
                    data-state-code={code}
                    role={card && !noAthletes ? "button" : "img"}
                    tabIndex={card && !noAthletes ? 0 : -1}
                    aria-label={card ? `${card.stateName} — ${noAthletes ? "no athletes in this dataset" : `${counts.olympic} Olympic, ${counts.paralympic} Paralympic athletes`}` : `${item.properties.name} — no state data loaded`}
                    onMouseEnter={(event) => describeFeature(item, event)}
                    onMouseMove={(event) => describeFeature(item, event)}
                    onFocus={() => describeFeature(item)}
                    onMouseLeave={() => {
                      setHoverTip(null);
                      if (selectedCard) setHint(formatMapHint(selectedCard));
                    }}
                    onBlur={() => selectedCard && setHint(formatMapHint(selectedCard))}
                    onClick={(event) => {
                      if (suppressClickRef.current || noAthletes) {
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
            {showCompleted && (
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
            )}
            {territoryLayouts.length > 0 && (
              <g className="territory-inset-layer" transform={`translate(${TERRITORY_INSET.x} ${TERRITORY_INSET.y})`}>
                {territoryLayouts.map(({ item, path: insetPath }, index) => {
                  const code = item.properties.stateCode;
                  const card = cardsByCode.get(code);
                  const counts = getRosterCounts(card);
                  const noAthletes = counts.total === 0;
                  const signal = card?.hometownPresenceBucket || "insufficient_data";
                  const className = [
                    "territory-inset",
                    noAthletes ? "no-athletes" : signal,
                    code === selectedCode ? "is-selected" : ""
                  ].filter(Boolean).join(" ");

                  return (
                    <g
                      key={code}
                      className={className}
                      data-state-code={code}
                      transform={`translate(${index * (TERRITORY_INSET.width + TERRITORY_INSET.gap)} 0)`}
                      role={noAthletes ? "img" : "button"}
                      tabIndex={noAthletes ? -1 : 0}
                      aria-label={`${card.stateName} — ${noAthletes ? "no athletes in this dataset" : `${counts.olympic} Olympic, ${counts.paralympic} Paralympic athletes`}`}
                      onMouseEnter={(event) => describeFeature(item, event)}
                      onMouseMove={(event) => describeFeature(item, event)}
                      onFocus={() => describeFeature(item)}
                      onMouseLeave={() => {
                        setHoverTip(null);
                        if (selectedCard) setHint(formatMapHint(selectedCard));
                      }}
                      onBlur={() => selectedCard && setHint(formatMapHint(selectedCard))}
                      onClick={(event) => {
                        if (suppressClickRef.current || noAthletes) {
                          event.preventDefault();
                          return;
                        }
                        onSelect(card.stateCode);
                      }}
                      onKeyDown={(event) => {
                        if (!noAthletes && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault();
                          onSelect(card.stateCode);
                        }
                      }}
                    >
                      <rect className="territory-inset-hit" x="0" y="0" width={TERRITORY_INSET.width} height={TERRITORY_INSET.height} rx="10" />
                      <path className="territory-inset-shape" d={insetPath(item)} />
                    </g>
                  );
                })}
              </g>
            )}
          </g>
        </svg>
          <RosterTooltip card={hoverTip?.card} position={hoverTip?.position} />
        </div>
        <div className="map-controls" aria-label="Map controls">
          <button className="map-control-button" type="button" onClick={zoomIn} aria-label="Zoom in" data-tooltip="Zoom in">+</button>
          <button className="map-control-button" type="button" onClick={zoomOut} aria-label="Zoom out" data-tooltip="Zoom out">−</button>
          <button className="map-control-button" type="button" onClick={locateCurrentState} disabled={isLocating} aria-label="Use my location" data-tooltip="My location">
            <Icon name="locate" size={16} strokeWidth={2} />
          </button>
          <button className="map-control-button" type="button" onClick={resetMap} aria-label="Reset map" data-tooltip="Reset map">
            <Icon name="reset" size={16} strokeWidth={2} />
          </button>
          <div className="map-controls-divider" aria-hidden="true" />
          <button
            className={`map-control-button${showCompleted ? " is-active" : ""}`}
            type="button"
            onClick={onToggleCompleted}
            aria-label="Toggle show completed states"
            aria-pressed={showCompleted}
            data-tooltip="Show completed"
          >
            <Icon name="check" size={16} strokeWidth={2.5} />
          </button>
          <div className="map-filter-wrap" ref={filterRef}>
            <button
              className={`map-control-button${filterOpen ? " is-active" : ""}`}
              type="button"
              onClick={() => setFilterOpen((o) => !o)}
              aria-label="Filter data view"
              aria-expanded={filterOpen}
              data-tooltip="Filter data"
            >
              <Icon name="filter" size={16} strokeWidth={2} />
            </button>
            {filterOpen && (
              <div className="map-filter-menu" role="menu">
                {dataScopeOptions.map((option) => (
                  <button
                    key={option.id}
                    role="menuitem"
                    className={`map-filter-option${activeDataScope === option.id ? " is-active" : ""}`}
                    onClick={() => { onDataScopeChange(option.id); setFilterOpen(false); }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <SignalLegend />
      <MapProgressBar discovered={discoveredCodes.size} total={totalStates} />
    </>
  );
}

export default StateMap;
