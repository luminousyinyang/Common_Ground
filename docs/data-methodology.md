# Data Methodology

The MVP dataset is generated from public TeamUSA.com Paris 2024 roster source rows and stored as aggregate state/territory-level JSON in `public/data/state-cards.json`.

## Source Inputs

- TeamUSA.com Paris 2024 Olympic roster
- TeamUSA.com Paris 2024 Paralympic roster
- NOAA public climate context labels
- `us-atlas` TopoJSON derived from U.S. Census cartographic state and territory boundaries

## Ingestion Policy

The ingest script lives at `scripts/ingest-teamusa-paris2024.mjs`.

It filters public roster records to U.S. hometown-state or supported U.S. territory abbreviations, aggregates by geography and sport family, and strips individual-level fields before writing frontend data.

Excluded from frontend output:

- Athlete names
- Athlete profile URLs
- Photos or likeness
- Biography fields
- Rankings, medals, finish times, and specific competition scores
- Any individual-level cards or leaderboards

## Count Meaning

"Official counts" in this prototype means sourced TeamUSA.com Paris 2024 public roster rows with a U.S. hometown-state or supported U.S. territory field. It is not a complete historical Team USA athlete census and should not be described that way.

State cards display signal buckets for the main card experience:

- `insufficient_data`: 0 sourced roster rows
- `low`: 1-4 sourced roster rows
- `medium`: 5-19 sourced roster rows
- `high`: 20+ sourced roster rows

Panel-level sport-family details require at least 3 sourced roster rows. Lower-volume panels stay generalized to avoid over-specificity.
