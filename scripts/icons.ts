// Renders scripts/icon.svg to the PNG icons in public/ (needs Chrome + playwright via python).
// Usage: bun scripts/icons.ts   — the PNGs are committed, so this only runs when the icon changes.
import { $ } from 'bun';
await $`python3 scripts/render_icons.py`;
