function briefingSections(briefing = {}) {
  if (briefing.stateSnapshot || briefing.whatToNotice || briefing.sharedStateSignal) {
    return [
      ["State Snapshot", briefing.stateSnapshot],
      ["Sport Mix", briefing.sportMix],
      ["Geography Lens", briefing.geographyLens],
      ["What To Notice", briefing.whatToNotice],
      ["Surprising Connection", briefing.surprisingConnection],
      ["Shared State Signal", briefing.sharedStateSignal]
    ].filter(([, value]) => Array.isArray(value) ? value.length : String(value || "").trim());
  }

  if (briefing.stateScene || briefing.sportMix || briefing.whyInteresting) {
    return [
      ["State Snapshot", briefing.stateScene],
      ["Sport Mix", [briefing.sportMix?.olympic, briefing.sportMix?.paralympic].filter(Boolean)],
      ["Geography Lens", briefing.geographyLens],
      ["What To Notice", briefing.whyInteresting],
      ["Surprising Connection", briefing.surprisingConnection],
      ["Shared State Signal", briefing.sharedSignal]
    ].filter(([, value]) => Array.isArray(value) ? value.length : String(value || "").trim());
  }

  return [
    ["State Snapshot", briefing.summary],
    ["Sport Mix", [
      briefing.olympicNarrative ? `Olympic side: ${briefing.olympicNarrative}` : "",
      briefing.paralympicNarrative ? `Paralympic side: ${briefing.paralympicNarrative}` : ""
    ].filter(Boolean)],
    ["Shared State Signal", briefing.sharedTraitExplanation]
  ].filter(([, value]) => Array.isArray(value) ? value.length : String(value || "").trim());
}

export function BriefingPanel({ payload, loading, onRefresh, compact = false }) {
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
                {value.map((item) => (
                  typeof item === "object" && item !== null
                    ? <p key={`${item.theme}-${item.detail}`}><strong>{item.theme}:</strong> {item.detail}</p>
                    : <p key={item}>{item}</p>
                ))}
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
