---
description: Create an annotated tag and push it to trigger the GAE deployment pipeline.
---

1. Run the tests and verify that they all pass. If they don't all pass, end this workflow without proceeding.
// turbo
npm run test

1. Create an annotated tag for the current commit.
// turbo
git tag -a "{{arg0}}" -m "Release {{arg0}} via Antigravity"

2. Push the tag to the remote to trigger the GitHub Action.
// turbo
git push origin "{{arg0}}"