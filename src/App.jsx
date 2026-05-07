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
import { useAuth } from "./auth/AuthContext.jsx";
import { loadUserCollection, saveUserCollection } from "./lib/userCollection.js";

const FALLBACK_DATA_SCOPES = [
  {
    id: "both",
    label: "Paris 2024 + Milano Cortina 2026",
    shortLabel: "Both",
    description: "Olympic Games Paris 2024, Paralympic Games Paris 2024, Olympic Winter Games Milano Cortina 2026, and Paralympic Winter Games Milano Cortina 2026 public rosters."
  },
  {
    id: "paris2024",
    label: "Paris 2024",
    shortLabel: "Paris 2024",
    description: "Olympic Games Paris 2024 and Paralympic Games Paris 2024 public rosters."
  },
  {
    id: "milanoCortina2026",
    label: "Milano Cortina 2026",
    shortLabel: "Milano Cortina 2026",
    description: "Olympic Winter Games Milano Cortina 2026 and Paralympic Winter Games Milano Cortina 2026 public rosters."
  }
];

function stripNestedScopes(card) {
  if (!card) return card;
  const { dataScopes, ...safeCard } = card;
  return safeCard;
}

function stateCardForScope(card, scopeId) {
  if (!card) return card;
  const scopedCard = scopeId === "both" ? card : card.dataScopes?.[scopeId] || card;
  return {
    ...stripNestedScopes(scopedCard),
    dataScopeId: scopeId
  };
}

function scopeOptionsForDataset(dataset) {
  const options = dataset?.meta?.dataScopes;
  return Array.isArray(options) && options.length ? options : FALLBACK_DATA_SCOPES;
}

function mergeCodes(current, incoming) {
  const next = new Set(current);
  for (const code of incoming || []) {
    if (typeof code === "string" && code.trim()) next.add(code.toUpperCase());
  }
  return next;
}

function App() {
  const routerNavigate = useNavigate();
  const location = useLocation();
  const {
    authError,
    isLoggedIn,
    loading: authLoading,
    logout,
    sessionError,
    user
  } = useAuth();

  const [darkMode, setDarkMode] = useState(false);
  const [dataset, setDataset] = useState(null);
  const [mapTopology, setMapTopology] = useState(null);
  const [geoTopology, setGeoTopology] = useState(null);
  const [selectedCode, setSelectedCode] = useState("CO");
  const [briefing, setBriefing] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [discoveredCodes, setDiscoveredCodes] = useState(() => new Set());
  const [playedCodes, setPlayedCodes] = useState(() => new Set());
  const [panelManifest, setPanelManifest] = useState(EMPTY_CARD_PANEL_MANIFEST);
  const [dataScope, setDataScope] = useState("paris2024");
  const [showCompleted, setShowCompleted] = useState(() => {
    try {
      const saved = window.localStorage.getItem("common-ground-show-completed");
      return saved === null ? true : saved === "true";
    } catch {
      return true;
    }
  });
  const [collectionReadyUid, setCollectionReadyUid] = useState(null);
  const [collectionSyncError, setCollectionSyncError] = useState("");

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("common-ground-discovered") || "[]");
      if (Array.isArray(saved) && saved.length) setDiscoveredCodes(new Set(saved));
    } catch {
      setDiscoveredCodes(new Set());
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
    } catch {
      setPlayedCodes(new Set());
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("common-ground-played", JSON.stringify([...playedCodes]));
    } catch {}
  }, [playedCodes]);

  useEffect(() => {
    try {
      window.localStorage.setItem("common-ground-show-completed", String(showCompleted));
    } catch {}
  }, [showCompleted]);


  useEffect(() => {
    if (!isLoggedIn || !user?.uid) {
      setCollectionReadyUid(null);
      setCollectionSyncError("");
      return undefined;
    }

    let cancelled = false;
    setCollectionReadyUid(null);

    loadUserCollection()
      .then((remoteCollection) => {
        if (cancelled) return;
        setDiscoveredCodes((current) => mergeCodes(current, remoteCollection.discoveredCodes));
        setPlayedCodes((current) => mergeCodes(current, remoteCollection.playedCodes));
        setCollectionReadyUid(user.uid);
        setCollectionSyncError("");
      })
      .catch((error) => {
        if (cancelled) return;
        setCollectionReadyUid(user.uid);
        setCollectionSyncError(error.message);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, user?.uid]);

  useEffect(() => {
    if (!isLoggedIn || !user?.uid || collectionReadyUid !== user.uid) return undefined;

    const timeout = window.setTimeout(() => {
      saveUserCollection({ discoveredCodes, playedCodes })
        .then(() => setCollectionSyncError(""))
        .catch((error) => setCollectionSyncError(error.message));
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [collectionReadyUid, discoveredCodes, isLoggedIn, playedCodes, user?.uid]);

  useEffect(() => {
    const html = document.documentElement;
    html.dataset.theme = ACTIVE_VISUAL_THEME.color;
    html.dataset.type = ACTIVE_VISUAL_THEME.type;

    function apply() {
      html.dataset.surface = darkMode ? "blacktop" : "";
    }

    if (!document.startViewTransition) {
      apply();
      return;
    }

    document.startViewTransition(apply);
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

  const dataScopeOptions = useMemo(() => scopeOptionsForDataset(dataset), [dataset]);
  const activeDataScope = dataScopeOptions.some((option) => option.id === dataScope) ? dataScope : "both";
  const selectedDataScope = dataScopeOptions.find((option) => option.id === activeDataScope) || FALLBACK_DATA_SCOPES[0];
  const scopedStates = useMemo(
    () => (dataset?.states || []).map((card) => stateCardForScope(card, activeDataScope)),
    [dataset, activeDataScope]
  );
  const cardsByCode = useMemo(() => new Map(scopedStates.map((card) => [card.stateCode, card])), [scopedStates]);
  const selectedBaseCard = cardsByCode.get(selectedCode) || scopedStates[0];
  const activePanelManifest = panelManifest;
  const selectedCard = useMemo(
    () => selectedBaseCard ? mergeGeneratedPanelData(selectedBaseCard, activePanelManifest) : selectedBaseCard,
    [selectedBaseCard, activePanelManifest]
  );
  const globalSourceRefs = useMemo(() => (dataset?.meta?.sourceRefs || []).filter((ref) => ref.sourceType !== "teamusa"), [dataset]);
  const sourceRefs = selectedCard && dataset ? uniqueSourceRefs([...(selectedCard.sourceRefs || []), ...globalSourceRefs]) : [];
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
    setBriefing(null);
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
  }, [selectedCard]);

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
    markDiscovered(code);
  }

  function selectState(code, openCard = true) {
    setSelectedCode(code);
    if (openCard) setIsCardModalOpen(true);
  }

  function navigate(path) {
    setIsCardModalOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    routerNavigate(path);
  }

  async function handleLogout() {
    try {
      await logout();
    } finally {
      navigate("/map");
    }
  }

  const navProps = {
    onNavigate: navigate,
    onLogin: () => navigate("/login"),
    onLogout: handleLogout,
    darkMode,
    onToggleDarkMode: () => setDarkMode((d) => !d),
    authLoading,
    isLoggedIn,
    user
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
          isLoggedIn ? (
            <Navigate to="/map" replace />
          ) : (
            <LoginPage
              {...navProps}
              authError={authError}
              onAuthSuccess={() => navigate("/map")}
              sessionError={sessionError}
            />
          )
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
                  <p className="safe-note">Explore aggregate Team USA athlete hometown and geography data by state. Darker states indicate higher hometown representation in the selected dataset.</p>
                  <StateMap
                    mapTopology={mapTopology}
                    features={features}
                    geoFeatures={geoFeatures}
                    cardsByCode={cardsByCode}
                    selectedCode={selectedCode}
                    onSelect={selectState}
                    discoveredCodes={discoveredCodes}
                    totalStates={scopedStates.length}
                    showCompleted={showCompleted}
                    onToggleCompleted={() => setShowCompleted((c) => !c)}
                    dataScopeOptions={dataScopeOptions}
                    activeDataScope={activeDataScope}
                    onDataScopeChange={(id) => setDataScope(id)}
                  />
                </section>
              </section>
            )
          } />
          <Route path="/collection" element={
            appGuard || (
              <CollectionView
                states={scopedStates}
                discoveredCodes={discoveredCodes}
                onSelect={(code) => selectState(code)}
                panelManifest={activePanelManifest}
                isLoggedIn={isLoggedIn}
                authLoading={authLoading}
                collectionSyncError={collectionSyncError}
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
                panelManifest={activePanelManifest}
                onGameComplete={() => markPlayed(selectedCode)}
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
          panelManifest={activePanelManifest}
          onCollect={() => markDiscovered(selectedCode)}
          isUnlocked={playedCodes.has(selectedCode)}
        />
      )}
    </>
  );
}

export default App;
