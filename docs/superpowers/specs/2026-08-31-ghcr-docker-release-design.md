# GHCR Docker image publish on Git tags

**Date:** 2026-08-31  
**Status:** Approved for implementation planning  
**Related:** Existing `Dockerfile`, `.github/workflows/ci.yml`, `DOCKER.md`

---

## 1. Goals & non-goals

### Goals

- On **Git tag** push matching `v*` (e.g. `v2.0.1`), automatically:
  1. Run **unit + build** and **e2e** in parallel (same quality bar as CI).
  2. If both pass, **build** the production `Dockerfile` and **push** to GHCR.
- Image name: `ghcr.io/yedeying/markdown-browser`
- Tags on each release: `<git-tag>` (e.g. `v2.0.1`) and `latest`
- Auth via `GITHUB_TOKEN` (`packages: write`); no extra Hub secrets

### Non-goals

- Push on every `main` commit or PR
- Multi-arch (`arm64`) in the first version — `linux/amd64` only
- Docker Hub or other registries
- Changing the Dockerfile runtime contract (`ENTRYPOINT` / ports / volumes)
- Signing / SBOM / provenance attestations (can add later)

---

## 2. Trigger & workflow layout

**New file:** `.github/workflows/release.yml`  
**Keep** `.github/workflows/ci.yml` unchanged for PR / `main` pushes.

```yaml
on:
  push:
    tags: ['v*']
```

Jobs:

| Job | Role |
|-----|------|
| `unit-build` | `bun install` → `bun test` → `bun run build` |
| `e2e` | install + Playwright Chromium → `bun run test:e2e` (`CI=true`) |
| `docker` | `needs: [unit-build, e2e]` → login GHCR → buildx build/push |

`unit-build` and `e2e` run in **parallel** with **no** `needs` between them (same as CI).  
`docker` runs only after **both** succeed.

---

## 3. Image naming & visibility

| Item | Value |
|------|--------|
| Registry | `ghcr.io` |
| Image | `ghcr.io/yedeying/markdown-browser` |
| Version tag | Git ref name without `refs/tags/` (e.g. `v2.0.1`) |
| Floating tag | `latest` (always moved to the tag that just published) |
| Package visibility | Public (matches a public GitHub repo; adjust in GHCR UI if needed) |

Pull example:

```bash
docker pull ghcr.io/yedeying/markdown-browser:v2.0.1
docker pull ghcr.io/yedeying/markdown-browser:latest
```

---

## 4. Docker job details

- `permissions`: `contents: read`, `packages: write`
- Login: `docker/login-action` → `ghcr.io` with `github.actor` + `secrets.GITHUB_TOKEN`
- Build: `docker/build-push-action` against repo-root `Dockerfile`
- Platform: `linux/amd64`
- Cache: GitHub Actions cache (`type=gha`)
- Metadata: prefer `docker/metadata-action` for tags `type=semver` / `type=raw,value=latest` derived from the git tag

No separate “export artifact from unit-build” step — the image builds from source inside Docker (multi-stage `Dockerfile` already installs and builds).

---

## 5. Docs

Update `DOCKER.md` (and a short pointer in README 测试/部署区 if needed):

- How to publish: `git tag vX.Y.Z && git push origin vX.Y.Z`
- How to pull from GHCR
- Note that tag workflow waits for tests before push

---

## 6. Success criteria

- Pushing `v*` tag runs release workflow; failing unit or e2e **blocks** image push
- Successful run publishes both version and `latest` tags on GHCR
- PR / `main` CI behavior unchanged
- Local `docker build -t vmd:latest .` path remains valid

---

## 7. Out of scope / follow-ups

- `linux/arm64` multi-platform build
- Cosign / attestation
- Automatic GitHub Release notes from the same tag
