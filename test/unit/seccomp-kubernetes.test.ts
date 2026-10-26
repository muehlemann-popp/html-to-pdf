import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

type Rule = { names: string[], action: string, args?: unknown[], includes?: unknown, excludes?: unknown }

const profile = JSON.parse(readFileSync('deploy/chrome-seccomp-kubernetes.json', 'utf8'))

describe('deploy/chrome-seccomp-kubernetes.json', () => {
  it('should be generated from deploy/chrome-seccomp.json', () => {
    // throws with the script's message if the committed file is out of date
    execFileSync(process.execPath, ['scripts/seccomp-kubernetes.mjs', '--check'], { stdio: 'pipe' })
  })

  it('should have no conditions a runtime could drop', () => {
    expect(profile.archMap).toBeUndefined()
    expect(profile.syscalls.filter((r: Rule) => r.includes || r.excludes)).toStrictEqual([])
  })

  // what Docker's profile allows only with CAP_SYS_ADMIN, clone/unshare only with the namespace mask
  it.each(['mount', 'umount2', 'setns', 'bpf', 'fsopen', 'open_by_handle_at', 'clone', 'unshare', 'clone3'])(
    'should not allow %s unconditionally',
    (name) => {
      const rules = profile.syscalls.filter((r: Rule) => r.names.includes(name) && r.action === 'SCMP_ACT_ALLOW')
      expect(rules.filter((r: Rule) => !r.args?.length)).toStrictEqual([])
    },
  )
})
