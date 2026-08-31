# GHCR Docker Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `v*` Git tags, run unit+build and e2e in parallel, then push `ghcr.io/yedeying/markdown-browser:<tag>` and `:latest` to GHCR.

**Architecture:** New `.github/workflows/release.yml` independent of `ci.yml`. Two gate jobs mirror CI; `docker` job `needs` both, uses buildx + metadata-action + GITHUB_TOKEN.

**Tech Stack:** GitHub Actions, Docker Buildx, GHCR, existing root `Dockerfile`

## Global Constraints

- Trigger only: `push` tags `v*`
- Image: `ghcr.io/yedeying/markdown-browser`
- Tags: git tag name + `latest`
- Platform: `linux/amd64` only
- Do not change `ci.yml` behavior for PR/main
- Do not change Dockerfile ENTRYPOINT/CMD contract

## File map

| File | Responsibility |
|------|----------------|
| `.github/workflows/release.yml` | Tag release: tests → docker push |
| `DOCKER.md` | Document tag publish + GHCR pull |
| `README.md` | One-line pointer to GHCR publish |

---

### Task 1: Add release workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Produces: workflow that publishes to `ghcr.io/yedeying/markdown-browser`

- [ ] **Step 1: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags: ['v*']

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

permissions:
  contents: read
  packages: write

jobs:
  unit-build:
    name: unit + build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun test
      - run: bun run build

  e2e:
    name: e2e
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bunx playwright install --with-deps chromium
      - run: bun run test:e2e
        env:
          CI: true

  docker:
    name: docker
    needs: [unit-build, e2e]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ghcr.io/yedeying/markdown-browser
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{raw}}
            type=raw,value=latest

      - uses: docker/build-push-action@v6
        with:
          context: .
          file: ./Dockerfile
          push: true
          platforms: linux/amd64
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

Notes for implementer:
- `type=semver,pattern={{raw}}` keeps the leading `v` (e.g. `v2.0.1`); `{{version}}` strips it (`2.0.1`). Spec asked for git-tag style — prefer **`{{raw}}` + `latest`** only (drop `{{version}}` if we want a single version tag matching the git tag exactly). **Use:** `type=ref,event=tag` OR `type=semver,pattern={{raw}}` plus `latest`.
- Final tags in file: `type=semver,pattern={{raw}}` and `type=raw,value=latest` (matches spec “`<git-tag>` e.g. v2.0.1”).

- [ ] **Step 2: Validate YAML locally**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"`  
(or `actionlint` if available). Expected: no parse error.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: publish Docker image to GHCR on version tags"
```

---

### Task 2: Document GHCR publish & pull

**Files:**
- Modify: `DOCKER.md` (replace or prepend a GHCR section near “部署到云平台”)
- Modify: `README.md` (short note under Docker section)

- [ ] **Step 1: Update DOCKER.md**

Add section **发布到 GHCR（自动）** before Docker Hub:

```markdown
### GHCR（推荐，CI 自动）

打 semver tag 并推送后，GitHub Actions `Release` 会先跑 unit+build 与 e2e，通过后推送：

- `ghcr.io/yedeying/markdown-browser:vX.Y.Z`
- `ghcr.io/yedeying/markdown-browser:latest`

```bash
git tag v2.0.1
git push origin v2.0.1

docker pull ghcr.io/yedeying/markdown-browser:v2.0.1
docker run -p 8888:8888 -v ~/docs:/markdown:ro ghcr.io/yedeying/markdown-browser:v2.0.1
```
```

Keep existing Docker Hub section as manual alternative.

- [ ] **Step 2: README pointer**

In Docker 部署 section, one line: 正式镜像由 tag 触发推到 GHCR，见 DOCKER.md.

- [ ] **Step 3: Commit**

```bash
git add DOCKER.md README.md
git commit -m "docs: document GHCR tag-based image publish"
```

---

### Task 3: Sanity checks

- [ ] **Step 1:** Confirm `ci.yml` untouched for PR/main
- [ ] **Step 2:** Confirm `Dockerfile` path in workflow is `./Dockerfile`
- [ ] **Step 3:** Do **not** push a real tag from the agent unless the user asks; tell user to run `git tag` / `git push --tags` when ready

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Tag-only trigger `v*` | Task 1 |
| unit+build ∥ e2e then docker | Task 1 |
| `ghcr.io/yedeying/markdown-browser` + tag + latest | Task 1 |
| amd64 only, GITHUB_TOKEN | Task 1 |
| Docs | Task 2 |
| ci.yml unchanged | Task 3 |
