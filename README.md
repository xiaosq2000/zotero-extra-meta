# zotero-extra-meta

Zotero 10+ plugin (`extra-meta@dotfiles.local`) that renders `Extra` metadata fields (`tex.venueabbr`, `tex.venuetag`, `tex.affiliation`, `tex.sourcecode`, `tex.projecturl`, `OpenReview`, and `arXiv`) as styled item-tree columns and editable Info-pane rows.

Venue distinctions and tracks (such as `Best Paper`, `Best Paper Finalist`, `Oral`, `Spotlight`, `Workshop`, or `Findings`) can be stored in `tex.venuetag` (with read and cleanup compatibility for `tex.venueaward` and `tex.venuetier`) or inline in `tex.venueabbr` (for example `NeurIPS 2025 (Oral)`), and render as independent venue and distinction badges in the Venue column.

## Development

```sh
npm test    # run syntax checks and unit/VM tests
npm run build   # build dist/zotero-extra-meta-<version>.xpi
```

## Releases

Tagging `v<version>` (matching `manifest.json`) runs tests, builds the deterministic `.xpi`, and publishes it as a GitHub Release asset.
