# Data Methodology

The MVP dataset is generated from approved public TeamUSA.com roster sources and stored as aggregate state/territory-level JSON in `public/data/state-cards.json`.

## Source Inputs

- TeamUSA.com Paris 2024 Olympic roster
- TeamUSA.com Paris 2024 Paralympic roster
- TeamUSA.com Milano Cortina 2026 Olympic roster
- TeamUSA.com Milano Cortina 2026 Paralympic roster
- NOAA public climate context labels
- `us-atlas` TopoJSON derived from U.S. Census cartographic state and territory boundaries

## Ingestion Policy

The ingest script lives at `scripts/ingest-teamusa-paris2024.mjs`.

It filters public roster records to U.S. hometown-state or supported U.S. territory abbreviations, filters athlete sport tags to the source Games season, deduplicates athletes across imported rosters in memory, aggregates by geography and sport family, and strips individual-level fields before writing frontend data.

The expanded card briefing can also show top city-level hometown areas when the public TeamUSA.com hometown city field has enough aggregate support for that state. These are labeled as public athletes, not a complete athlete census.

Excluded from frontend output:

- Athlete names
- Athlete profile URLs
- Photos or likeness
- Biography fields
- Rankings, medals, finish times, and specific competition scores
- Any individual-level cards or leaderboards

## Count Meaning

"Official counts" in this prototype means deduplicated public TeamUSA.com athletes from the imported rosters with a U.S. hometown-state or supported U.S. territory field. It is not a complete historical Team USA athlete census and should not be described that way.

State cards display signal buckets for the main card experience:

- `insufficient_data`: 0 sourced public athletes
- `low`: 1-4 sourced public athletes
- `medium`: 5-19 sourced public athletes
- `high`: 20+ sourced public athletes

Low-volume program panels may show a fallback sport cue when public athletes exist. Stronger featured sport signals have 3+ sourced public athletes.

The app stores only aggregate city labels and counts, plus Olympic-side and Paralympic-side athlete totals; it does not store athlete names, profile links, images, bios, or individual records.
