# Documentation

Project documentation for `html-to-pdf` — the Express + Puppeteer service that renders HTML to
PDF and PNG, published as the public image `muehlemannpopp/html-to-pdf`. Keep docs close to the
code and updated as part of the change that affects them.

The top-level `README.md` is the user-facing document: what the service does, how to run it, and
the HTTP API. It is also served as the service's own `/` route. This folder is for contributors —
how the thing works inside, why it is built the way it is, and what is planned.

## Structure

| Folder | Contents |
|---|---|
| `docs/architecture/` | How a subsystem works today — the design, the invariants, what you must not break. Read before changing the code it describes. |
| `docs/features/` | Per-feature documentation — what a feature is, how it's built, the contract with its callers. One file per capability. |
| `docs/adr/` | Architecture Decision Records — one decision per file, `NNNN-kebab-title.md`. Context, decision, consequences. |
| `docs/plans/` | Implementation plans / task breakdowns for in-flight or upcoming work, with status. |
| `docs/research/` | Dated findings — root-cause investigations, gap analyses, spikes. Evidence and a verdict, not a task list. |

Only `README.md` lives at the top level; every document belongs to one of the five folders.
File names are `kebab-case.md`; ADRs are prefixed with a zero-padded sequence number (`0001-`,
`0002-`, …) that is never reused.

### Which folder

Two questions decide it.

**Is it living or frozen?** `architecture/`, `features/` and `plans/` are kept current — you edit
them when the code changes, and a plan is deleted or folded into its architecture doc once it lands.
`adr/` and `research/` are dated records: they capture what was true and why at a moment in time, so
you supersede them with a new file rather than rewriting them.

**Which question does it answer?**

| Question | Folder |
|---|---|
| How does this work, and what breaks if I change it? | `architecture/` |
| What is this feature, end to end? | `features/` |
| Why did we choose this over the alternative? | `adr/` |
| What are we going to do, in what order? | `plans/` |
| Why does it behave like that? | `research/` |

## Conventions

- When you build or change a capability, create/update its doc in `docs/features/`.
- When you make a non-obvious design/architecture decision, record an ADR in `docs/adr/`.
- When you plan multi-step work, capture it in `docs/plans/` and keep its status current. When the
  work lands, fold what stays true into the architecture doc rather than leaving the plan as the
  record.
- When you chase down a behaviour, write it up in `docs/research/` with the date and the commit you
  read it against, and say what you verified and what you did not.
- Add every new file to the index below in the same commit.
- Cross-link with relative paths (`../research/foo.md`), and link the issue or pull request the
  work belongs to at the top of plan, ADR and research files.
- Write every document so it stands on its own. A reader with nothing but this repository should
  be able to follow it: no links into private systems, no assumptions about a particular
  deployment, and any behaviour a document depends on either stated or linked to upstream.

## Index

### Plans

- [Dependency upgrade](plans/dependency-upgrade.md) — the phased plan out of Node 19 /
  Puppeteer 19 / Express 4 / Sentry 7, with the four confirmed hard breaks called out.
