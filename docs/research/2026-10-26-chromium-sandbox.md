# Chromium sandbox in the container: what it needs and what it costs

**Date:** 2026-10-26 · **Read against:** `feat/chromium-155` (`695067b`, merged as `d97e614`) plus the
`CHROME_SANDBOX` change · **Context:** [#14](https://github.com/muehlemann-popp/html-to-pdf/pull/14) ·
**Decision taken from it:** [ADR 0003](../adr/0003-opt-in-chromium-sandbox.md)

## Question

The service has always launched Chromium with `--no-sandbox --no-zygote`. What does it take to run
Chromium 155 (`chromium-headless-shell` on Alpine 3.24) with its sandbox in the image, and what does
that cost in memory, latency and output?

## Method

Host: Apple Silicon (arm64), OrbStack, Docker 29.8.2, Linux 7.2 kernel; image built from this branch
(`html-to-pdf:sandbox`, Chromium 155.0.8059.84, Node 26.12.1), running as `chrome` (uid 1001).
`scripts/benchmark.mjs` as in the [Chromium 155 note](2026-10-26-chromium-155-memory.md), with the new
`--security-opt=` option; `scripts/compare-references.mjs` for the outputs. Namespaces were read from
`/proc/<pid>/ns/*` of every Chromium process while a capture was open.

A first round earlier the same day patched the flags into the bundle of an `html-to-pdf:n26` image
and ran with `seccomp=unconfined`; its numbers are listed where they differ.

## Results

### What the sandbox needs

| Seccomp profile, `CHROME_SANDBOX` | `/selfcheck` | Chromium processes |
| --- | --- | --- |
| Docker default, off | 200 | 2 |
| Docker default, on | 500, `FATAL … No usable sandbox!`, restart loop | 0 |
| `deploy/chrome-seccomp.json`, off | 200 | 2 |
| `deploy/chrome-seccomp.json`, on | 200 | 6 |
| `deploy/chrome-seccomp.json`, on, `--cap-drop ALL --security-opt no-new-privileges` | 200 | 6 |
| `deploy/chrome-seccomp.json`, on, as root | fails, `Running as root without --no-sandbox is not supported` | 0 |

The profile is Docker's default with three changes (see ADR 0003): `clone` and `unshare` may create
user, PID and network namespaces, and `chroot` no longer needs `CAP_SYS_CHROOT`. Mount, cgroup, UTS
and IPC namespaces, `setns` and `clone3` stay blocked; Chromium needs none of them. The whole test
suite passes in both modes (41 tests), and the sandbox tests fail under Docker's default profile.

With the sandbox on, the processes of one open capture are: browser, GPU and broker in the
container's namespaces; one zygote in them and two zygotes in a new user, PID and network
namespace; the renderer in that user and network namespace and a further PID namespace. With the
sandbox off, the renderer shares all namespaces with node. The renderers' own network namespace has
no network; pages are fetched by the network service in the browser process.

### Cost

Peak memory (MiB, `memory.peak` / sampled `anon` peak) and median latency (ms), no memory limit:

| Scenario | sandbox off | sandbox on |
| --- | --- | --- |
| idle (no browser yet) | 52 / 25 | 31 / 25 |
| selfcheck | 115 / 77, 38 ms | 87 / 80, 21 ms |
| simple | 98 / 78, 41 ms | 87 / 80, 25 ms |
| rich | 136 / 86, 751 ms | 161 / 89, 728 ms |
| long (60 p) | 121 / 102, 108 ms | 120 / 106, 97 ms |
| screenshot | 112 / 83, 100 ms | 104 / 87, 99 ms |
| parallel8 | 264 / 218, 84 ms | 201 / 159, 72 ms |

Under `--memory=160m` both modes handle `parallel8`, `rich` and `long` without a failed request
(parallel8 anon peak 153 vs 152 MiB). The first round (`seccomp=unconfined`) gave the same picture:
simple 51 vs 32 ms, parallel8 90 vs 99 ms, parallel8 peak 257 vs 199 MiB, both fine under 160 MiB.

`memory.peak` varies with the page cache a container is charged (see the Chromium 155 note); the
anon peaks and the limit runs are the comparable numbers. Single requests cost the same. Under 8
concurrent requests the sandbox used ~60 MiB less in both rounds; a likely reason is that renderers
forked from the zygote share its pages copy-on-write, which was not verified.

Idle, the sandboxed browser keeps 6 Chromium processes instead of 2 (the zygotes and the broker).
When the browser closes after `BROWSER_IDLE_TIMEOUT_MS`, none of them is left in either mode
(re-run of `simple` and `parallel8` after rebasing onto `d97e614`, same latency and memory picture
as above).

### Rendering

Reference outputs with the sandbox on against off: same page count and size, 0.0% differing pixels on
every compared page of `simple`, `rich` and `long`; `screenshot.png` is byte-identical.

## Verdict

The sandbox is free in memory, latency and output. What it costs is a deployment requirement: a
non-root user, unprivileged user namespaces on the host and the seccomp profile. Turning it on by
default would make every deployment without the profile fail `/selfcheck`, so it is opt-in
(`CHROME_SANDBOX=1`) for now.

The sandbox confines a compromised renderer. It does nothing against SSRF: the browser process
still loads any URL and subresource a page asks for, with the container's network.

Not verified: amd64, Kubernetes with a `Localhost` seccomp profile (containerd or CRI-O), hosts
with AppArmor user-namespace restrictions (Ubuntu 23.10+, including the GitHub Actions runners,
which CI will show), and gVisor or other sandboxed runtimes.
