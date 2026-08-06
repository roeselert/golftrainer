---
name: agentic-coding-workflow
description: The house workflow for building software with Claude — arc42-style CLAUDE.md architecture docs, bootstrapped projects with quality signals (Checkstyle, PMD/SpotBugs, CPD, security patterns, dependency scans), user-story-driven feature specs with plan-then-build, mandatory architecture doc updates, and a two-stage manual + agentic review. Use this skill whenever starting a new project or repo, bootstrapping with a starter (start.spring.io, npm init, Vite, etc.), setting up CLAUDE.md or architecture documentation, specifying or implementing a feature, or reviewing code. Also use it when the user says "new feature", "let's build X", "set up the project", "review this", or asks how work should be organized here — even if they don't name this workflow.
---

# Agentic Coding Workflow

The operating manual for how work happens in this codebase. Follow the phases in
order. Do not skip the architecture updates or the review stage — they are the
parts that keep the agent honest over long horizons.

## Phase 1 — CLAUDE.md as the architecture spine

`CLAUDE.md` lives at repo root and is arc42-inspired. It is the first thing read
and the last thing updated. Structure:

### 1.1 System vision
- One-paragraph purpose statement.
- Main use cases (bullet list, actor + goal).
- Value proposition: what breaks / who suffers if this system doesn't exist.

### 1.2 Stakeholders
Table: `Role | Interest | What they need from the system`. Include the
non-obvious ones (ops, security, compliance, downstream teams).

### 1.3 System context diagram
The system as one black box, surrounded by external actors and systems, with
labelled data/control flows. Mermaid `flowchart` or C4 context notation.

### 1.4 Business component diagram
Interior of the box: business capabilities as components, their dependencies,
and which ones own which data. Business language, not framework names.

### 1.5 Technology choices
Table: `Decision | Chosen | Alternatives considered | Rationale`. Short ADR
entries. Record *why*, not just *what*.

### Diagram maintenance rule (non-negotiable)
**Whenever a change touches a system boundary, a component, or a dependency,
the 1.3 and 1.4 diagrams are updated in the same change.** No follow-up ticket.
A PR that shifts architecture without touching CLAUDE.md is incomplete.

## Phase 2 — Bootstrap and quality signals

### 2.1 Bootstrap with standard tooling
Use canonical generators, never hand-rolled scaffolds:
`start.spring.io`, `npm init` / `npm create vite`, `cargo new`, `dotnet new`,
`poetry new`. Commit the untouched output first, then customize. This keeps the
diff between "vanilla" and "ours" visible.

### 2.2 Add tools as signals
Signals, not gates-for-their-own-sake: each tool answers a question the agent
cannot answer by reading code. Wire all of them into the build and into CI.

| # | Signal | Question it answers | Typical tools |
|---|---|---|---|
| 2.2.1 | Style | Is this consistent with the codebase? | Checkstyle, ESLint, Prettier, ruff, rustfmt |
| 2.2.2 | Static bug patterns | Is this likely wrong? | PMD, SpotBugs (FindBugs successor), TypeScript strict, mypy |
| 2.2.3 | Duplication | Did the agent copy-paste instead of abstracting? | CPD, jscpd, `pmd cpd` |
| 2.2.4 | Security bug patterns | Is this insecure by construction? | find-sec-bugs, Semgrep, bandit, ESLint security plugins |
| 2.2.5 | Vulnerability scan | Are dependencies known-bad? | OWASP Dependency-Check, `npm audit`, Trivy, Dependabot/Renovate |

Rules:
- Fail the build on new findings; baseline existing ones rather than silencing.
- Every suppression carries an inline comment with a reason.
- Report signal deltas to the user after each feature ("+0 style, +1 CPD hit in
  `OrderMapper` — want me to extract?").

## Phase 3 — Feature specification

### 3.1 Write user stories
`As a <role>, I want <capability>, so that <benefit>.` Each story gets explicit
acceptance criteria in Given/When/Then form. Stories are the unit of work; a
story too large to review in one sitting gets split.

### 3.2 Chat to clarify open questions
Before any code: list open questions and unstated assumptions, and ask. Do not
resolve ambiguity silently. Typical gaps: error/edge behaviour, authorization,
idempotency, volumes, what happens on partial failure. Fold the answers back
into the acceptance criteria.

### 3.3 Create and review the plan
Produce a written plan before implementing: files to touch, new components,
data-model impact, test strategy, risks. The user reviews and amends the plan.
**Plan approval precedes implementation.**

### 3.4 Build, then chat for adjustments
Implement the approved plan in small, reviewable increments. Surface deviations
immediately — if reality contradicts the plan, stop and re-plan rather than
improvising past it. Iterate conversationally on the result.

## Phase 4 — Update the architecture documents

Part of the same change, not a cleanup pass. Update:

- **4.1 System context** (CLAUDE.md 1.3) — new external systems, actors, flows.
- **4.2 Business component model** (CLAUDE.md 1.4) — new/changed components and
  dependencies.
- **4.3 Data model** — entities, attributes, relationships, ownership.
  *Use the Business Analyst skill for notation and level of detail.*
- **4.4 Flow diagram** — the end-to-end business flow the feature realizes,
  including error paths. *Use the Business Analyst skill.*

If a phase-4 update turns out to be impossible to draw cleanly, that is a design
smell — raise it before finishing.

## Phase 5 — In-depth review

Both passes run. Neither substitutes for the other.

### 5.1 Manual review
Prepare the change for a human: a summary of what changed and why, the plan-vs-
actual delta, the signal report from 2.2, and an explicit list of the riskiest
spots with the reasoning behind them. Make the reviewer's job cheap.

### 5.2 Agentic review
A fresh-context review pass against the change, reading the code *and* the
updated CLAUDE.md. Check specifically:

- Acceptance criteria — each one demonstrably met, with a test.
- Architecture conformance — does the code match the diagrams just updated?
- Boundary integrity — no leaks across component boundaries, no sneaky new
  dependencies.
- Error and edge paths — not just the happy path.
- Test quality — assertions that would actually fail, not tautologies.
- Signal findings — every new finding addressed or justified.
- Deletion check — dead code, leftover scaffolding, stale docs removed.

Findings are triaged with the user before merge; nothing is silently fixed.

## Definition of done

- [ ] Acceptance criteria met and covered by tests
- [ ] All quality signals green (or deltas explicitly accepted)
- [ ] CLAUDE.md 1.3 / 1.4 updated; data model and flow diagram updated
- [ ] Technology decisions recorded in 1.5 if any were made
- [ ] Manual review prepared; agentic review run and findings triaged

# How to start a new project

1. Create CLAUDE.md if not present
2.1 Ask for system vision 
2.2 Ask for quality goals
2.3 create the paragraph
3. Ask for stake holder and create the paragraph
4. Ask for system context and create diagram
5. Aks for technology choices and creat paragraph