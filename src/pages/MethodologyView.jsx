import React from "react";
import { formatExcludedRows, getRosterCounts, titleBucket } from "../lib/stateCard.js";

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

function MethodologyView({ refs, meta, states, dataScope }) {
  const activeScopeId = dataScope?.id || "both";
  const scopedCounts = states.reduce(
    (totals, card) => {
      const counts = getRosterCounts(card);
      totals.olympic += counts.olympic;
      totals.paralympic += counts.paralympic;
      totals.total += counts.total;
      return totals;
    },
    { olympic: 0, paralympic: 0, total: 0 }
  );
  const rosterSourceTotals = Object.values(meta.sourceRosterTotals || {}).filter((source) =>
    activeScopeId === "both" || source.gamesScope === activeScopeId
  );
  const rosterSourceSummary = rosterSourceTotals.length
    ? rosterSourceTotals.map((source) => `${source.label}: ${source.total}`).join("; ")
    : `Olympic ${meta.sourceProgramRecordTotals?.olympic}, Paralympic ${meta.sourceProgramRecordTotals?.paralympic}`;

  return (
    <section className="methodology-view page-panel">
      <div className="methodology-hero">
        <p className="eyebrow">Rules-aware build notes</p>
        <h2>Methodology and Compliance</h2>
        <p>{dataScope?.description || meta.datasetLabel} The app keeps Olympic and Paralympic sport families in one shared state view, uses aggregate buckets, and avoids athlete-level output.</p>
      </div>
      <div className="method-grid">
        <section>
          <h3>Data Policy</h3>
          <ul>
            <li>The aggregate dataset is derived from approved public TeamUSA.com roster sources: {rosterSourceSummary}.</li>
            <li>Deduplicated public athletes with supported U.S. hometown geography fields in the current data view: Olympic {scopedCounts.olympic}, Paralympic {scopedCounts.paralympic}, total {scopedCounts.total}.</li>
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
        <p>Counts reflect deduplicated public TeamUSA.com athletes from the selected imported rosters with supported U.S. hometown geography fields, not a complete historical athlete census. Current data view: {dataScope?.label || "selected roster view"}.</p>
        <CountsTable states={states} />
      </section>
      <section className="source-panel">
        <h3>Source Labels</h3>
        <SourceList refs={refs} />
      </section>
    </section>
  );
}

export default MethodologyView;
