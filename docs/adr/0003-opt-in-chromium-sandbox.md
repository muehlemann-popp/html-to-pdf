# 0003 — Opt-in Chromium sandbox with a shipped seccomp profile

**Date:** 2026-10-26 · **Status:** accepted · **Context:** [ADR 0002](0002-shared-browser.md),
[research](../research/2026-10-26-chromium-sandbox.md), builds on
[#14](https://github.com/muehlemann-popp/html-to-pdf/pull/14)

## Context

Chromium has always run with `--no-sandbox --no-zygote`. A page that exploits a renderer bug then
runs code as the service itself: it can read the other requests' pages in the shared browser
(ADR 0002), the container's environment and files, and anything the container can reach. The README
answers that with "not a public service, only print content you control".

The image runs as the non-root user `chrome`, and Alpine's `chromium-headless-shell` ships no setuid
`chrome-sandbox` helper, so the only sandbox available is Chromium's user-namespace sandbox: a
zygote in new user, PID and network namespaces, renderers forked from it, then Chromium's own
seccomp-bpf filter. Creating those namespaces needs `clone`/`unshare` with namespace flags, which
Docker's default seccomp profile only allows with `CAP_SYS_ADMIN`. Under the default profile the
launch dies with `FATAL … No usable sandbox!`, every capture and `/selfcheck` answer 500, and the
process goes into the restart loop of `deploy/docker-entrypoint.sh`.

Measured (research note): the sandbox costs nothing in memory, latency or output. It adds idle
processes (the zygotes) and a deployment requirement.

## Decision

- `CHROME_SANDBOX=1` turns the sandbox on: `src/controller/browser.ts` then leaves out
  `--no-sandbox` and `--no-zygote` (the namespace sandbox forks renderers from the zygote). It keeps
  `--disable-setuid-sandbox` in both modes, there is no setuid helper to fall back to. Default is
  off, so existing deployments keep passing their readiness probe.
- `deploy/chrome-seccomp.json` is the profile to run it with: Docker's default profile
  ([moby/profiles `seccomp/v0.2.3`](https://github.com/moby/profiles/blob/seccomp/v0.2.3/seccomp/default.json),
  the one Docker 29.8 uses) with three changes, each marked with a `comment`:
  1. `clone` without `CAP_SYS_ADMIN` may create user, PID and network namespaces (the mask
     `0x7E020000` becomes `0x0E020000`); mount, cgroup, UTS and IPC namespaces stay blocked.
  2. `unshare` without `CAP_SYS_ADMIN`, with the same mask.
  3. `chroot` without the `CAP_SYS_CHROOT` condition: Chromium chroots into an empty directory
     inside its own user namespace, which must also work with `--cap-drop ALL`.

  `clone3` keeps answering `ENOSYS` (seccomp cannot see its flags); callers fall back to `clone`.
  `setns`, `mount` and the rest of Docker's `CAP_SYS_ADMIN` list are not needed and stay blocked.
- CI runs the whole test suite a second time with `CHROME_SANDBOX=1` and the profile. The `test`
  image runs as `chrome` for that, like `prod`, since Chromium refuses its sandbox as root.
  `test/acceptance/sandbox.test.ts` asserts that renderers run in their own user, PID and network
  namespaces when the sandbox is on, and in the service's when it is off.

## Alternatives

- **Sandbox on by default now.** Every deployment that does not apply the profile would fail its
  readiness probe after the upgrade. Revisit for a major release, once the profile has been run in
  real deployments.
- **`seccomp=unconfined`** or **`CAP_SYS_ADMIN`**: both work, both trade the renderer sandbox for a
  container with no syscall filter or with most of root's powers. Not documented as a way to run it.
- **Zenika's `chrome.json`** (a 2017 allow list): allows `clone`/`unshare` with every namespace
  flag, plus `setns`, `sethostname`, `syslog`, `open_by_handle_at` and others Chromium does not
  need, and is not maintained alongside Docker's profile.
- **Setuid sandbox:** would need a setuid-root binary in the image; Alpine does not ship one.

## Consequences

- With the sandbox on, a compromised renderer is confined to Chromium's sandbox: no access to the
  service's files, environment or other processes. The browser process itself is not sandboxed.
- The sandbox does **not** prevent SSRF. Pages are still loaded by the browser process with the
  container's network: any URL or subresource, internal hosts, services on `localhost`, cloud
  metadata endpoints. Network policy is still needed for untrusted input.
- Deployments that opt in need a non-root user, a host that allows unprivileged user namespaces and
  the profile (Docker `--security-opt seccomp=…`, Kubernetes `seccompProfile: Localhost` with the
  file on every node). Kubernetes and hosts with AppArmor user-namespace restrictions (Ubuntu
  23.10+) were not tested.
- The profile is a copy of Docker's. When the image is meant to run on a newer Docker with a changed
  default profile, re-derive it from that release (`diff` against upstream shows only the three rules
  above; the file is tab-indented like upstream for that reason).
- Six idle Chromium processes instead of two (browser, GPU, broker and three zygote processes).
