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
      <span className="legend-item"><i className="signal-dot insufficient_data" /><span>Limited data</span></span>
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
      <span>Olympic hometown athletes: {counts.olympic}</span>
      <span>Paralympic hometown athletes: {counts.paralympic}</span>
      <span>Total: {counts.total}</span>
      <span>{card.sharedTrait.name}</span>
    </div>
  );
}

function StateMap({ mapTopology, features, geoFeatures, cardsByCode, selectedCode, onSelect, discoveredCodes = new Set(), totalStates = 0 }) {
  const [hint, setHint] = useState("Select or focus a state to preview Team USA athlete hometown counts and sport presence.");
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
  const selectedCard = cardsByCode.get(selectedCode);

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

  function isInteractiveMapTarget(target) {
    return target instanceof Element && Boolean(target.closest(".state-path.has-data, .territory-inset"));
  }

  function handlePointerDown(event) {
    if (event.button !== 0) return;
    if (isInteractiveMapTarget(event.target)) return;
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
          <button className="map-control-button" type="button" onClick={zoomIn} aria-label="Zoom in" data-tooltip="Zoom in">+</button>
          <button className="map-control-button" type="button" onClick={zoomOut} aria-label="Zoom out" data-tooltip="Zoom out">−</button>
          <button className="map-control-button" type="button" onClick={locateCurrentState} disabled={isLocating} aria-label="Use my location" data-tooltip="My location">
            <Icon name="locate" size={16} strokeWidth={2} />
          </button>
          <button className="map-control-button" type="button" onClick={resetMap} aria-label="Reset map" data-tooltip="Reset map">
            <Icon name="reset" size={16} strokeWidth={2} />
          </button>
        </div>
        <svg
          ref={svgRef}
          className={`state-map ${isDragging ? "is-dragging" : ""}`}
          viewBox="0 0 975 610"
          role="img"
          aria-label="Interactive U.S. map. Select a state to explore Team USA athlete hometown patterns."
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
                    aria-label={card ? `View ${card.stateName} state insights — ${counts.olympic} Olympic, ${counts.paralympic} Paralympic hometown athletes` : `${item.properties.name} — no state data loaded`}
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
                      aria-label={`View ${card.stateName} state insights — ${counts.olympic} Olympic, ${counts.paralympic} Paralympic hometown athletes`}
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
                        onSelect(card.stateCode);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelect(card.stateCode);
                        }
                      }}
                    >
                      <rect className="territory-inset-hit" x="34" y="8" width="104" height="40" rx="6" />
                      <path className="territory-inset-shape" d={territoryPath(item)} />
                    </g>
                  );
                })}
              </g>
            )}
          </g>
        </svg>
        <RosterTooltip card={hoverTip?.card} position={hoverTip?.position} />
      </div>
      <SignalLegend />
      <MapProgressBar discovered={discoveredCodes.size} total={totalStates} />
    </>
  );
}

export default StateMap;
