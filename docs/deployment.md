# Testing and publishing Crop Trainer

A pull request to `main` runs the CPU regression suite, the synthetic field preflight and a Chromium test on the built website. Once a change lands on `main` and all three pass, a separate job publishes that same artifact to GitHub Pages. Open the workflow run to see which check failed or follow its deployment link to the published app. [Workflow runs](https://github.com/mvalancy/crop-trainer/actions/workflows/pages.yml) · [Public app](https://mvalancy.github.io/crop-trainer/)

## Run the release checks locally

Use Node.js 22 or later. The workflow uses Node.js 24 on Ubuntu. Playwright is a development dependency for these release checks. Opening Crop Trainer in a browser or running its CPU trainer requires no npm packages.

```sh
npm ci
npm test
npm run preflight
npm run build:pages -- /tmp/crop-trainer-pages
npx --no-install playwright install --only-shell chromium
npm run test:pages -- /tmp/crop-trainer-pages
```

Choose an empty output directory for the build. On a Linux machine that needs Chromium’s system libraries, use `npx --no-install playwright install --with-deps --only-shell chromium`. To use an existing Chromium installation, set `CHROMIUM_PATH` to its executable when running the browser test.

The test starts a local server at the project path `/crop-trainer/` and opens the site at mobile width. It grows a second field, checks its downloaded recipe and opens and dismisses contextual help. On the apple orchard screen it switches to dormant foliage in the advanced settings and applies the change. It checks access to the scan summary, scrolling and fullscreen at desktop and mobile sizes. It then trains on CPU, downloads the weights and checks all three scoring distances. Finally, it runs a two-seed benchmark and verifies the exported scores at three cutoffs. This check exercises browser training and file downloads. A physical WebGPU measurement requires a GPU run on the target device.

## Publish a tested revision

Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. A push to `main` starts the release. To rerun the current revision, select **Actions → Test and deploy Crop Trainer → Run workflow** and choose `main`. Pull requests and manual runs on other branches execute the checks with read-only repository access. The deployment job receives the Pages and OIDC permissions after verification succeeds.

A failed check leaves the last successful deployment serving. To restore an earlier version, revert the relevant change on `main` so the same checks cover the revision being republished. [Workflow definition](https://github.com/mvalancy/crop-trainer/blob/main/.github/workflows/pages.yml) · [Pages build script](https://github.com/mvalancy/crop-trainer/blob/main/ci/build-pages.mjs) · [Browser checks](https://github.com/mvalancy/crop-trainer/blob/main/ci/smoke-pages.mjs)
