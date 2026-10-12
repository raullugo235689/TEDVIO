# Mis grupos: release checklist

The catalogue implementation is in `src/features/groups/GroupCatalogExperience.tsx` and its scoped stylesheet. Existing group CRUD, academic deletion and institution identity components remain the source of truth.

Before merging, run `npm ci` and `npm run quality` in this directory, then the repository's Phase 6 Chromium/WebKit browser suite. Review the `groups-premium-*` screenshots using synthetic accounts only.

Production serves the tracked `teacher-v2` directory, not TypeScript source. Include the reproducible output of the existing frontend build workflow before publication. Never change a production student's records to prepare a screenshot.

Artwork provenance and runtime scope are documented in `../../docs/groups-premium-art.md`. No database migration or new environment variable is needed for this release.
