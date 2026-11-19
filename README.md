# zotero-extra-meta

Zotero 10+ plugin (`extra-meta@dotfiles.local`) that renders `Extra` metadata fields (`tex.venueabbr`, `tex.affiliation`, `tex.sourcecode`, `tex.projecturl`, `OpenReview`, and `arXiv`) as styled item-tree columns and editable Info-pane rows.

## Development

```sh
npm test    # run syntax checks and unit/VM tests
npm run build   # build dist/zotero-extra-meta-<version>.xpi
```

## Releases

Tagging `v<version>` (matching `manifest.json`) runs tests, builds the deterministic `.xpi`, and publishes it as a GitHub Release asset.
