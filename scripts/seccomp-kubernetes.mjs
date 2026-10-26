#!/usr/bin/env node
// Writes deploy/chrome-seccomp-kubernetes.json from deploy/chrome-seccomp.json.
//
//   node scripts/seccomp-kubernetes.mjs [--check]
//
// deploy/chrome-seccomp.json is in Docker's format: rules can depend on the container's
// capabilities, architecture and kernel (`includes`/`excludes`), and Docker evaluates them.
// A Kubernetes `Localhost` profile goes to the container runtime as is, and containerd reads it as an
// OCI seccomp spec, which has no such conditions: it drops them and applies every rule. The rule that
// allows `mount`, `setns`, `bpf`, … with CAP_SYS_ADMIN would then allow them to everyone.
//
// This resolves the conditions for the container the README's pod spec describes: capabilities
// dropped, amd64 or arm64 (the platforms the image is published for), a kernel newer than 4.x.
// --check exits 1 if the committed file differs from what this would write.
import { readFileSync, writeFileSync } from 'node:fs'

const SOURCE = 'deploy/chrome-seccomp.json'
const TARGET = 'deploy/chrome-seccomp-kubernetes.json'
const ARCHES = ['amd64', 'arm64']

const fail = (message, rule) => {
  throw new Error(`${message}: ${JSON.stringify(rule)}`)
}

// whether a rule applies to `arch`, judged by its arch conditions only
const appliesTo = (rule, arch) => (!rule.includes?.arches || rule.includes.arches.includes(arch))
  && !rule.excludes?.arches?.includes(arch)

const resolve = (rule) => {
  const unknown = [...Object.keys(rule.includes ?? {}), ...Object.keys(rule.excludes ?? {})]
    .filter((key) => !['caps', 'arches', 'minKernel'].includes(key))
  if (unknown.length) fail(`unknown condition ${unknown}`, rule)
  // granted only with capabilities the container does not have
  if (rule.includes?.caps?.length) return []
  const arches = ARCHES.filter((arch) => appliesTo(rule, arch))
  if (!arches.length) return []
  // without its condition the rule applies to every architecture; fine for a list of syscalls that
  // only exist on some (the runtime skips unknown names), not for argument checks
  if (arches.length < ARCHES.length && rule.args?.length) fail(`argument check only for ${arches}`, rule)
  const minKernel = rule.includes?.minKernel
  if (minKernel && Number(minKernel.split('.')[0]) > 4) fail(`needs kernel ${minKernel}`, rule)
  const { includes, excludes, ...rest } = rule
  return [rest]
}

const source = JSON.parse(readFileSync(SOURCE, 'utf8'))
// archMap is Docker's as well; without it the runtime filters the native architecture only
const { archMap, syscalls, ...rest } = source
const profile = { ...rest, syscalls: syscalls.flatMap(resolve) }
const output = `${JSON.stringify(profile, null, '\t')}\n`

if (process.argv.includes('--check')) {
  if (readFileSync(TARGET, 'utf8') !== output) {
    console.error(`${TARGET} is out of date, run: node scripts/seccomp-kubernetes.mjs`)
    process.exit(1)
  }
} else {
  writeFileSync(TARGET, output)
}
