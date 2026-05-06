import React, { useEffect, useMemo, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { feature } from "topojson-client";
import {
  ACTIVE_VISUAL_THEME,
  EMPTY_CARD_PANEL_MANIFEST,
  FIPS_TO_CODE
} from "./lib/constants.js";
import {
  fallbackBriefing,
  getJson,
  mergeGeneratedPanelData,
  uniqueSourceRefs
} from "./lib/stateCard.js";
import AppShell from "./components/layout/AppShell.jsx";
import StateMap from "./components/map/StateMap.jsx";
import CardModal from "./components/cards/CardModal.jsx";
import ChallengeView from "./components/challenge/ChallengeView.jsx";
import CollectionView from "./components/collection/CollectionView.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import MethodologyView from "./pages/MethodologyView.jsx";

function App() {
  const routerNavigate = useNavigate();
  const location = useLocation();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [dataset, setDataset] = useState(null);
  const [mapTopology, setMapTopology] = useState(null);
  const [geoTopology, setGeoTopology] = useState(null);
  const [selectedCode, setSelectedCode] = useState("CO");
  const [briefing, setBriefing] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [discoveredCodes, setDiscoveredCodes] = useState(() => new Set(["CO"]));
  const [playedCodes, setPlayedCodes] = useState(() => new Set());
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
    try {
      const saved = JSON.parse(window.localStorage.getItem("common-ground-played") || "[]");
      if (Array.isArray(saved) && saved.length) setPlayedCodes(new Set(saved));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("common-ground-played", JSON.stringify([...playedCodes]));
    } catch {}
  }, [playedCodes]);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("theme-transitioning");
    html.dataset.theme = ACTIVE_VISUAL_THEME.color;
    html.dataset.surface = darkMode ? "blacktop" : "";
    html.dataset.type = ACTIVE_VISUAL_THEME.type;
    const t = setTimeout(() => html.classList.remove("theme-transitioning"), 400);
    return () => clearTimeout(t);
  }, [darkMode]);

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

  function markPlayed(code) {
    setPlayedCodes((current) => {
      const next = new Set(current);
      next.add(code);
      return next;
    });
  }

  function selectState(code, openCard = true) {
    setSelectedCode(code);
    markDiscovered(code);
    if (openCard) setIsCardModalOpen(true);
  }

  function navigate(path) {
    setIsCardModalOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    routerNavigate(path);
  }

  const navProps = {
    onNavigate: navigate,
    onLogin: () => navigate("/login"),
    darkMode,
    onToggleDarkMode: () => setDarkMode((d) => !d)
  };

  const isAppRoute = location.pathname !== "/" && location.pathname !== "/login";

  const appGuard = loadError ? (
    <div className="load-state">
      <h1>Common Ground could not start.</h1>
      <p>{loadError}</p>
    </div>
  ) : (!dataset || !mapTopology || !geoTopology || !selectedCard) ? (
    <div className="load-state">
      <p>Loading map and sourced state aggregates...</p>
    </div>
  ) : null;

  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage {...navProps} />} />
        <Route path="/login" element={
          <LoginPage
            {...navProps}
            onLogin={() => { setIsLoggedIn(true); navigate("/map"); }}
          />
        } />
        <Route element={<AppShell {...navProps} />}>
          <Route path="/map" element={
            appGuard || (
              <section className="map-explorer-shell">
                <section className="map-surface page-panel" aria-labelledby="mapTitle">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Geography-powered fan discovery</p>
                      <h2 id="mapTitle">State Atlas</h2>
                    </div>
                  </div>
                  <p className="safe-note">Explore aggregate state signals from public Team USA and geography data. Patterns may suggest fan-discovery context and do not imply performance outcomes.</p>
                  <StateMap
                    mapTopology={mapTopology}
                    features={features}
                    geoFeatures={geoFeatures}
                    cardsByCode={cardsByCode}
                    selectedCode={selectedCode}
                    onSelect={selectState}
                    discoveredCodes={discoveredCodes}
                    totalStates={dataset.states.length}
                  />
                </section>
              </section>
            )
          } />
          <Route path="/collection" element={
            appGuard || (
              <CollectionView
                states={dataset.states}
                discoveredCodes={discoveredCodes}
                onSelect={(code) => selectState(code)}
                panelManifest={panelManifest}
                isLoggedIn={isLoggedIn}
                onLogin={() => navigate("/login")}
              />
            )
          } />
          <Route path="/challenge" element={
            appGuard || (
              <ChallengeView
                card={selectedCard}
                briefing={briefing}
                onReturn={() => navigate("/map")}
                panelManifest={panelManifest}
                onGameComplete={() => markPlayed(selectedCode)}
              />
            )
          } />
          <Route path="/methodology" element={
            appGuard || (
              <MethodologyView
                refs={dataset.meta.sourceRefs || []}
                meta={dataset.meta}
                states={dataset.states}
              />
            )
          } />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {isCardModalOpen && isAppRoute && selectedCard && (
        <CardModal
          card={selectedCard}
          sourceRefs={sourceRefs}
          briefing={briefing}
          briefingLoading={briefingLoading}
          onRefreshBriefing={() => refreshBriefing(selectedCard)}
          onOpenChallenge={() => {
            setIsCardModalOpen(false);
            navigate("/challenge");
          }}
          onClose={() => setIsCardModalOpen(false)}
          panelManifest={panelManifest}
          isUnlocked={playedCodes.has(selectedCode)}
        />
      )}
    </>
  );
}

export default App;
