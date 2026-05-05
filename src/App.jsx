import { useEffect, useMemo, useState } from 'react';
import { feature } from 'topojson-client';
import { ACTIVE_VISUAL_THEME, EMPTY_CARD_PANEL_MANIFEST, FIPS_TO_CODE } from './lib/constants.js';
import { fallbackBriefing, getJson, mergeGeneratedPanelData, uniqueSourceRefs } from './lib/stateCard.js';
import TopNav from './components/navigation/TopNav.jsx';
import AppShell from './components/layout/AppShell.jsx';
import ViewSlider from './components/layout/ViewSlider.jsx';
import StateMap from './components/map/StateMap.jsx';
import CardModal from './components/cards/CardModal.jsx';
import ChallengeView from './components/challenge/ChallengeView.jsx';
import CollectionView from './components/collection/CollectionView.jsx';
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import MethodologyView from './pages/MethodologyView.jsx';

export default function App() {
  const [page, setPage] = useState("landing");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
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
    const html = document.documentElement;
    html.classList.add("theme-transitioning");
    html.dataset.theme = ACTIVE_VISUAL_THEME.color;
    html.dataset.surface = darkMode ? "blacktop" : "";
    html.dataset.type = ACTIVE_VISUAL_THEME.type;
    const t = setTimeout(() => html.classList.remove("theme-transitioning"), 400);
    return () => clearTimeout(t);
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
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    return <LoginPage {...navProps} onLogin={() => { setIsLoggedIn(true); navigate("app"); }} />;
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
      {(view === "explorer" || view === "collection") && (
        <ViewSlider activeIndex={view === "explorer" ? 0 : 1}>
          <div className="view-slide">
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
          </div>
          <div className="view-slide">
            <CollectionView states={dataset.states} discoveredCodes={discoveredCodes} onSelect={(code) => selectState(code, "collection")} panelManifest={panelManifest} isLoggedIn={isLoggedIn} onLogin={() => navigate("login")} />
          </div>
        </ViewSlider>
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
