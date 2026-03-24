# 16. Planning and Reasoning Architecture

## Overview

The conductor and orchestrators form a planning and reasoning system that balances proactive goal-oriented behavior with reactive responsiveness to user input. Unlike traditional reactive task managers, this system maintains persistent "living plans" that are continuously updated as context evolves, enables visible planning that builds user trust, and coordinates planning across multiple workspaces to surface unexpected opportunities and optimize resource allocation.

The planning layer is not a separate cognitive step hidden from the user—it is transparent, persistent, and participatory.

---

## Core Planning Philosophy

### From Reactive to Proactive-with-Intent

Traditional systems are reactive: user issues command → system executes. This OS operates in a different mode:

1. **User states goal/context** → Conductor builds initial plan
2. **System maintains plan** across work sessions, actively monitoring progress
3. **System detects deviations and opportunities** (missed deadlines, emergent blockers, cross-workspace synergies)
4. **System suggests interventions** calibrated to user's current state and preferences
5. **User steers mid-course** with lightweight adjustments, not full replanning

This shifts planning from one-time artifact to persistent, living document.

### Transparency Over Hidden Chain-of-Thought

Users should see the conductor's reasoning about *what to do next*, not internal deliberation:

- ❌ Hidden: Claude silently decides next step and begins work
- ✅ Visible: "Step 2 requires data from the API. I'm retrieving it now. [Progress bar]"

Visible reasoning serves three functions:
1. **Builds trust**: User can validate that the system understands the goal correctly
2. **Enables early intervention**: User spots wrong direction before work completes
3. **Educates the user**: Over time, user sees patterns in how complex work decomposes

---

## Plan Creation: From Goal to Structured Breakdown

### Initial Plan Generation

When a user introduces a workspace goal or the conductor detects a need for planning, the system generates an initial plan through structured analysis:

#### Input Signals
- Explicit user statement ("I need to finish chapter 3 by Friday")
- Inferred context (user opens file titled "thesis-chapter3.md" + calendar shows Friday deadline)
- Cross-workspace clues ("you started a similar analysis in the Q2 budget review")
- Ambient context (workspace history, past plan patterns, time pressure)

#### Plan Generation Process

1. **Goal Decomposition**
   - Parse stated goal into measurable outcomes
   - Identify implicit sub-goals ("finish chapter 3" implies research, drafting, reviewing, formatting)
   - Extract constraints (deadline, resource dependencies, quality standards)

2. **Dependency Analysis**
   - Map task dependencies: which tasks must precede others?
   - Identify external blockers (waiting on feedback, data retrieval)
   - Surface resource constraints (CPU time for processing, human review bandwidth)

3. **Effort Estimation**
   - Based on workspace history and similar past tasks
   - Account for user's typical work pace and interruption patterns
   - Flag if goal appears infeasible given deadline and current state

4. **Sequencing**
   - Order tasks to minimize blocking (parallelize when possible)
   - Place high-risk or unknown-difficulty tasks early to detect problems
   - Group related work to reduce context switching

5. **Contingency Planning**
   - Identify likely failure modes (data unavailable, unexpected complexity)
   - Pre-stage fallback approaches
   - Buffer time for iteration

#### Example: Thesis Chapter Plan

**User statement**: "I need to finish chapter 3 by Friday. It's about ML interpretability in clinical contexts."

**Generated plan**:
```
Goal: Complete chapter 3 draft (3500-4000 words, literature grounded, clinical examples)
Deadline: Friday 5pm
Status: Started (1200 words, basic structure)

Phase 1: Research & Contextualization (Today-Tomorrow)
  ├─ Task 1.1: Retrieve recent papers on interpretability in healthcare [2-3 hours]
  │   └─ Blocker check: Do you have access to arXiv/journals?
  ├─ Task 1.2: Synthesize interpretability frameworks (attention, SHAP, etc.) [3 hours]
  │   └─ Dependency: After 1.1
  └─ Task 1.3: Identify 2-3 clinical case studies [2 hours]

Phase 2: Drafting & Integration (Wednesday-Thursday)
  ├─ Task 2.1: Expand 1.2 into section 3.1 (Interpretability Methods) [4 hours]
  │   └─ Dependency: After 1.2
  ├─ Task 2.2: Draft section 3.2 (Clinical Application Examples) [4 hours]
  │   └─ Dependency: After 1.3
  └─ Task 2.3: Write section 3.3 (Implications & Limitations) [3 hours]

Phase 3: Review & Polish (Thursday evening - Friday)
  ├─ Task 3.1: Self-review for clarity and coherence [2 hours]
  ├─ Task 3.2: Fact-check citations [1 hour]
  ├─ Task 3.3: Format and proofread [1 hour]
  └─ Task 3.4: Final read-through [30 minutes]

Estimated total: 25-27 hours
Available time: ~20 hours (1-2 hours/day + Friday)
⚠️ FLAG: Timeline is tight. Recommend starting research immediately.

Dependencies:
  - Access to literature databases
  - Feedback availability from advisor (if needed before Friday)

Risks:
  - Research phase uncovers more relevant papers than expected (expand to 4 hours buffer)
  - Clinical case studies hard to contextualize (have 2-hour fallback: use hypothetical examples)
```

---

## Plan Representation: Data Structure

Plans are stored as structured objects with rich metadata, enabling monitoring, updating, and cross-workspace analysis.

### JSON Schema for Plan Objects

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "Workspace Plan",
  "properties": {
    "id": {
      "type": "string",
      "description": "Unique plan ID (workspace-id-v{version})",
      "example": "thesis-chapter3-v1"
    },
    "workspaceId": {
      "type": "string",
      "description": "Reference to parent workspace"
    },
    "goal": {
      "type": "object",
      "description": "The overarching goal this plan addresses",
      "properties": {
        "statement": {
          "type": "string",
          "description": "Plain-language goal statement"
        },
        "success_criteria": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Measurable outcomes that define completion"
        },
        "priority": {
          "enum": ["critical", "high", "medium", "low"],
          "description": "Relative importance vs other workspace goals"
        }
      },
      "required": ["statement", "success_criteria"]
    },
    "constraints": {
      "type": "object",
      "description": "Boundary conditions on the plan",
      "properties": {
        "deadline": {
          "type": "string",
          "format": "date-time",
          "description": "Hard deadline for goal completion"
        },
        "timeAvailable": {
          "type": "integer",
          "description": "Estimated user-hours available before deadline"
        },
        "resourceConstraints": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "resource": {
                "type": "string"
              },
              "availability": {
                "type": "string"
              },
              "impact": {
                "type": "string"
              }
            }
          }
        }
      }
    },
    "phases": {
      "type": "array",
      "description": "Ordered phases of work toward goal",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "example": "phase-1-research"
          },
          "name": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "estimatedDuration": {
            "type": "object",
            "properties": {
              "min": {"type": "integer"},
              "max": {"type": "integer"},
              "unit": {"enum": ["hours", "days"]}
            }
          },
          "tasks": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "example": "task-1-1"
                },
                "title": {
                  "type": "string"
                },
                "description": {
                  "type": "string"
                },
                "estimatedHours": {
                  "type": "number"
                },
                "dependencies": {
                  "type": "array",
                  "items": {"type": "string"},
                  "description": "IDs of tasks that must precede this one"
                },
                "blockers": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "description": {"type": "string"},
                      "resolution": {"type": "string"}
                    }
                  },
                  "description": "Known external dependencies or uncertainties"
                },
                "fallbacks": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "scenario": {"type": "string"},
                      "approach": {"type": "string"},
                      "timeImpact": {"type": "string"}
                    }
                  }
                },
                "owner": {
                  "type": "string",
                  "description": "Who executes (user, conductor, external agent)"
                },
                "status": {
                  "enum": ["not-started", "in-progress", "blocked", "complete", "cancelled"],
                  "default": "not-started"
                },
                "actualHours": {
                  "type": "number",
                  "description": "Time spent so far (updated as task progresses)"
                },
                "notes": {
                  "type": "string"
                }
              },
              "required": ["id", "title", "estimatedHours", "owner"]
            }
          }
        },
        "required": ["id", "name", "tasks"]
      }
    },
    "risks": {
      "type": "array",
      "description": "Known risks and mitigation strategies",
      "items": {
        "type": "object",
        "properties": {
          "risk": {
            "type": "string",
            "description": "Description of potential problem"
          },
          "likelihood": {
            "enum": ["low", "medium", "high"]
          },
          "impact": {
            "enum": ["low", "medium", "high"]
          },
          "mitigation": {
            "type": "string",
            "description": "How to reduce likelihood or impact"
          }
        },
        "required": ["risk", "mitigation"]
      }
    },
    "metrics": {
      "type": "object",
      "description": "Key metrics for tracking progress",
      "properties": {
        "totalEstimatedHours": {
          "type": "number"
        },
        "totalActualHours": {
          "type": "number"
        },
        "completionPercentage": {
          "type": "number",
          "minimum": 0,
          "maximum": 100
        },
        "onTrack": {
          "type": "boolean",
          "description": "Is plan progressing on schedule?"
        },
        "velocityPercentage": {
          "type": "number",
          "description": "Actual progress / expected progress at this point"
        }
      }
    },
    "visibility": {
      "type": "object",
      "description": "What parts of plan show in user-facing UI",
      "properties": {
        "showInTaskPanel": {
          "type": "boolean"
        },
        "showEstimates": {
          "type": "boolean"
        },
        "showRisks": {
          "type": "boolean"
        },
        "detailLevel": {
          "enum": ["summary", "phases-only", "full"]
        }
      }
    },
    "createdAt": {
      "type": "string",
      "format": "date-time"
    },
    "lastUpdatedAt": {
      "type": "string",
      "format": "date-time"
    },
    "version": {
      "type": "integer",
      "description": "Plan version (incremented on major updates)"
    },
    "previousVersions": {
      "type": "array",
      "description": "Archive of prior versions for comparing plan evolution",
      "items": {
        "type": "object",
        "properties": {
          "version": {"type": "integer"},
          "changedAt": {"type": "string", "format": "date-time"},
          "reason": {"type": "string"},
          "diff": {"type": "object"}
        }
      }
    }
  },
  "required": ["id", "workspaceId", "goal", "phases"]
}
```

### Plan Storage

Plans are persisted in workspace metadata with version control:

```
workspace/
├── .meta/
│   ├── active-plan.json          # Current working plan
│   └── plan-history/
│       ├── plan-v1-created.json
│       ├── plan-v2-deadline-extended.json
│       └── plan-v3-major-revision.json
```

---

## Plan Monitoring: Tracking Progress

Plans are continuously monitored to detect divergence from expectations and trigger updates.

### Monitoring Signals

The conductor tracks:

1. **Task Completion Rate**
   - Is progress aligning with the phased schedule?
   - Calculate: (tasks completed / tasks in current phase) vs expected % for current date

2. **Velocity Tracking**
   - How much actual time does work consume vs estimates?
   - Formula: `velocity = actual_hours_spent / estimated_hours_for_completed_work`
   - If velocity > 1.2, system flag: "This is taking longer than expected"

3. **Blocker Emergence**
   - New blockers that weren't in the original plan?
   - Examples: "Couldn't access database", "Feedback delayed", "Complexity higher"
   - Trigger: Conductor asks "What's blocking you?" when task stalls

4. **Deadline Pressure**
   - Calculate: `remaining_hours_available = (deadline - now) / estimated_hours_remaining`
   - If ratio < 1.5, system enters high-alert mode: "We need to accelerate"

5. **Context Shifts**
   - User workspace interaction patterns change?
   - New competing goals created?
   - Real-world deadlines shift?
   - Trigger re-evaluation of priority

### Progress Display

In the task panel, users see:

```
📋 Chapter 3 Plan (Created 2 days ago, deadline Friday 5pm)

Phase 1: Research [=======>        ] 60% (1.5 days)
  ✓ Retrieve papers
  ⏳ Synthesize frameworks (1.2 hrs / 3 hrs estimated)
  ⬜ Identify case studies

Phase 2: Drafting [=>               ] 5% (2.5 days, starts Wednesday)
  ⬜ Section 3.1
  ⬜ Section 3.2
  ⬜ Section 3.3

Phase 3: Review [                 ] 0% (1 day, Friday)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status: On track ✓
Total time spent: 4.5 / 25-27 hours estimated
Velocity: 1.1x (slightly above estimate, normal)
Deadline buffer: 18 hours remaining, 13 hours of work left
→ On pace to complete by Thursday evening
```

### Monitoring Triggers

Certain conditions trigger plan review or user notification:

| Condition | Trigger | Action |
|-----------|---------|--------|
| Velocity > 1.3x | Task taking 30% longer than estimated | Conductor alerts: "This phase is taking longer. Should we adjust scope?" |
| New blocker emerges | Task stalls without clear reason | Conductor asks: "What's stopping progress? How can I help?" |
| Deadline at risk | Less than 1.2x buffer remaining | Conductor suggests: "We should accelerate Phase 2. Options: scope reduction, parallel work, schedule adjustment" |
| Phase completion slips | Actual completion date drifts past estimate | Plan automatically re-sequences remaining work |
| Goal context shifts | User adds conflicting goal or changes stated priority | Conductor flags conflict: "New goal might impact chapter 3. How should we prioritize?" |
| Velocity stabilizes | Pattern emerges (e.g., consistent 1.1x overhead) | Conductor updates future estimate multiplier |

---

## Plan Updating: Triggers and Processes

Plans are living documents, updated regularly as reality diverges from expectations.

### Update Triggers

#### 1. Scheduled Review (Weekly/Biweekly)
- Conductor automatically reviews active plans
- Checks: velocity trends, risk emergence, deadline pressure
- Updates visibility, sequences, estimates based on new data

#### 2. Task Completion
- When task completes, actual hours logged
- Velocity recalculated
- Remaining phases re-sequenced if necessary

#### 3. Blocker Detection
- New external dependency discovered
- Resource becomes unavailable
- Prerequisite task fails or cascades impact

#### 4. Goal Context Shift
- User adds conflicting goal with earlier deadline
- Priority of workspace changes
- Real-world constraint changes (vacation, emergencies)

#### 5. Velocity Pattern Shift
- Consistent over/under performance across multiple tasks
- Suggests estimates systematically wrong or work pace changed
- Triggers estimate re-calibration for remaining phases

#### 6. User Request
- User explicitly asks to revise plan
- "Can we move the deadline?", "This is lower priority now"
- "Can we reduce scope and ship early?"

### Update Process

When update triggered:

1. **Analyze Deviation**
   - What changed? Why?
   - Is it a one-time anomaly or pattern?
   - Impact: Does it affect deadline feasibility?

2. **Decision Point**
   - If on track: Minor updates to velocity estimates, continue
   - If at risk: Offer options (scope reduction, deadline extension, resource increase)
   - If blocked: Pause plan, diagnose blocker, unblock or pivot

3. **Update Plan**
   - Create new version with timestamp and reason
   - Preserve history (previous versions archived)
   - Recalculate metrics (completion %, deadline status)

4. **Communicate with User**
   - Show what changed and why
   - If major: Request user approval of new plan
   - If minor: Async notification, user can review/override

#### Example: Deadline Extension Plan Update

**Initial plan**: Chapter 3 due Friday
**Trigger**: User mentions advisor feedback delayed until Monday
**Deviation**: Cycle with feedback is now necessary; original plan assumes no iteration

**Update options presented to user**:
```
Option A: Extend deadline to Wednesday (after feedback)
  • Gives 1.5 extra days for revision
  • Requires notifying advisor of new plan
  • More polished final product likely

Option B: Reduce scope, ship Friday without feedback cycle
  • Self-review only
  • Faster but higher risk of revisions later
  • Saves 1-2 days now, possible debt later

Option C: Parallel path
  • Draft v1 Friday (rough)
  • Integrate feedback Monday-Tuesday
  • Polish Wednesday
  • Allows Friday milestone while accommodating feedback

[Choose update]
```

### Update History Example

```json
{
  "id": "thesis-chapter3-v1",
  "previousVersions": [
    {
      "version": 1,
      "createdAt": "2026-03-21T09:00:00Z",
      "changedAt": "2026-03-21T09:00:00Z",
      "reason": "Initial plan creation",
      "deadline": "2026-03-28T21:00:00Z",
      "totalEstimatedHours": 25
    },
    {
      "version": 2,
      "createdAt": "2026-03-21T09:00:00Z",
      "changedAt": "2026-03-22T15:30:00Z",
      "reason": "Velocity correction: Phase 1 taking 1.3x longer than estimated. Increased estimate buffer.",
      "deadline": "2026-03-28T21:00:00Z",
      "totalEstimatedHours": 27,
      "diff": {
        "phase_1_duration": {"old": "5 hours", "new": "6.5 hours"},
        "phase_2_duration": {"old": "11 hours", "new": "12 hours"},
        "totalEstimatedHours": {"old": 25, "new": 27}
      }
    },
    {
      "version": 3,
      "createdAt": "2026-03-22T15:30:00Z",
      "changedAt": "2026-03-23T10:00:00Z",
      "reason": "User feedback: Advisor review delayed to Monday. Extended deadline and added feedback integration phase.",
      "deadline": "2026-03-31T17:00:00Z",
      "totalEstimatedHours": 29,
      "diff": {
        "deadline": {"old": "2026-03-28T21:00Z", "new": "2026-03-31T17:00Z"},
        "phases": {"added": "Phase 4: Feedback Integration (2 hours)"}
      }
    }
  ]
}
```

---

## Living Plan Document Format

The living plan is not just a data structure—it's a workspace artifact that evolves alongside the work.

### Document Structure

Plans live as markdown documents (for readability) alongside structured JSON (for automation):

**File**: `workspace/.meta/PLAN.md`

```markdown
# Chapter 3: ML Interpretability in Clinical Contexts

**Status**: In Progress (Phase 1 - Research)
**Created**: March 21, 2026
**Last Updated**: March 23, 2026
**Deadline**: Friday, March 28 (5pm) — 4 days away
**Progress**: 18% of estimated work complete

## Goal

Complete a comprehensive 3500-4000 word chapter on machine learning interpretability applied to clinical contexts. Must include literature review, interpretability frameworks, and clinical case studies.

**Success Criteria**:
- Draft complete and self-reviewed by Friday 5pm
- Grounded in current literature (papers from 2024-2026)
- Minimum 2-3 clinical examples or case studies
- Clear connection to thesis argument

## Timeline & Phases

### Phase 1: Research & Contextualization ✓ IN PROGRESS
**Timeline**: March 21-22 (Today-Tomorrow)
**Status**: 60% complete (1.5 days)
**Time spent**: 4.5 hours / 7.5 estimated

- [x] Task 1.1: Retrieve papers on interpretability in healthcare (2-3 hours)
  - ✓ Completed March 21
  - Collected 23 papers from arXiv, IEEE, medical journals
  - Time spent: 1.2 hours

- [⏳] Task 1.2: Synthesize interpretability frameworks (3 hours)
  - In progress (1.2 / 3 hours)
  - Frameworks covered: SHAP, LIME, attention mechanisms, concept activation vectors
  - On track, wrapping up today

- [ ] Task 1.3: Identify 2-3 clinical case studies (2 hours)
  - Not started
  - Starting tomorrow morning
  - Will review papers from 1.1 for case study candidates

### Phase 2: Drafting & Integration → STARTING WEDNESDAY
**Timeline**: March 25-27 (Wednesday-Thursday)
**Status**: Not started (0% complete, estimated 11 hours)

- [ ] Task 2.1: Expand frameworks into section 3.1 (4 hours)
- [ ] Task 2.2: Draft section 3.2 - Clinical Examples (4 hours)
- [ ] Task 2.3: Write section 3.3 - Implications (3 hours)

### Phase 3: Review & Polish → FRIDAY
**Timeline**: March 28 (Friday)
**Status**: Not started (0% complete, estimated 5 hours)

- [ ] Task 3.1: Self-review and coherence check (2 hours)
- [ ] Task 3.2: Fact-check citations (1 hour)
- [ ] Task 3.3: Format and proofread (1 hour)
- [ ] Task 3.4: Final read-through (30 min)

## Work Estimate

| Phase | Estimated | Actual | Status |
|-------|-----------|--------|--------|
| Phase 1: Research | 7.5 hrs | 4.5 hrs | On track |
| Phase 2: Drafting | 11 hrs | — | Not started |
| Phase 3: Review | 5 hrs | — | Not started |
| **Total** | **23.5 hrs** | **4.5 hrs** | **19% complete** |

**Velocity**: 1.1x (slightly above estimate, normal variation)

## Deadline Status

- **Deadline**: Friday 5pm (4 days, ~16 available hours assuming 4 hrs/day)
- **Work remaining**: ~19 hours
- **Buffer**: -3 hours (TIGHT BUT FEASIBLE)
- **Recommendation**: Plan to work 5 hours/day to comfortably finish Thursday

## Known Blockers & Risks

### Risk 1: Literature scope creep (Medium likelihood, High impact)
- **Description**: New interpretability papers constantly published; could spend unlimited time reading
- **Mitigation**: Set hard stop at 25 papers reviewed; focus on papers with clinical applications
- **Status**: Mitigating now; paper list finalized by end of today

### Risk 2: Clinical case studies hard to contextualize (Medium likelihood, Medium impact)
- **Description**: Adapting academic papers' examples to thesis argument might be harder than expected
- **Fallback**: Use hypothetical clinical scenarios based on framework. Less concrete but maintains timeline.
- **Status**: Will assess during Task 1.3

### Risk 3: Feedback loop timing (Low likelihood, Medium impact)
- **Description**: Advisor feedback expected mid-week; iteration might conflict with drafting
- **Mitigation**: Will have draft framework ready by Wednesday, can integrate feedback into sections 3.2-3.3

## Cross-Workspace Synergies

- **Q2 Budget Analysis project**: The statistical interpretation section from that analysis is directly applicable to section 3.1. Consider referencing or adapting.
- **Systems Design presentation**: You're prepping an interpretability framing for that too. Case studies here could inform that talk.

## Recent Changes

### v3 Update — March 23, 10am
- Extended deadline from Friday to Monday (advisor feedback timing)
- Velocity on Phase 1 running 1.1x, factored into Phase 2-3 estimates
- Added feedback integration task

### v2 Update — March 22, 3:30pm
- Adjusted Phase 1 estimate from 5.5 to 7.5 hours (velocity correction)
- Rationalized: research phase more complex than initial assumption

---

## Next Steps (Today)

1. Finish Task 1.2 by end of day (remaining 1.8 hours)
2. Start Task 1.3 tomorrow morning (2 hours)
3. By Wednesday morning: Ready to begin Phase 2 drafting

**Conductor checkpoint**: Is this plan still aligned with your priorities?
```

### Properties of Living Plan Document

1. **Human-Readable Primary**
   - Markdown format, readable in editor
   - Structured so skimming shows essential info (status, deadline, next steps)

2. **Always Current**
   - Updated whenever major trigger fires
   - Timestamp shows last update
   - Version history preserved

3. **Participatory**
   - User can edit directly (or conductor suggests edits)
   - Checkboxes reflect actual task completion
   - Comments/annotations embedded

4. **Cross-Referenced**
   - Mentions related workspace work
   - Links to source documents, papers, references
   - Flags conflicting goals or opportunities

5. **Action-Oriented**
   - Ends with "Next Steps" section
   - Shows immediate next 1-2 days clearly
   - Blockers surface early

---

## Visible Plan Display in Task Panel

The user-facing UI shows plans through a dedicated task panel with multiple detail levels.

### Summary View (Default)

```
┌─────────────────────────────────────────────────┐
│ 📋 Chapter 3 Plan                               │
├─────────────────────────────────────────────────┤
│ Status: On Track ✓                              │
│ Deadline: Friday 5pm (4 days)                   │
│ Progress: 18% (4.5/23.5 hrs)                    │
│                                                 │
│ Current Phase: Research & Contextualization     │
│ [=========>        ] 60%                         │
│                                                 │
│ 🎯 Today's focus:                              │
│   ⏳ Task 1.2: Synthesize frameworks            │
│      (1.2 / 3 hours) — on pace                  │
│                                                 │
│ ⚠️  Tomorrow: Start case study analysis         │
│                                                 │
│ [Expand Details] [Adjust Plan]                 │
└─────────────────────────────────────────────────┘
```

### Phases View

```
┌──────────────────────────────────────────────────────┐
│ 📋 Chapter 3 (Full Breakdown)                        │
├──────────────────────────────────────────────────────┤
│                                                      │
│ Phase 1: Research [=========>      ] 60%             │
│   ✓ Retrieve papers (1.2 hrs)                        │
│   ⏳ Synthesize frameworks (1.2/3 hrs)               │
│   ⬜ Case studies (0/2 hrs)                          │
│                                                      │
│ Phase 2: Drafting [>               ] 0%              │
│   ⬜ Section 3.1 (4 hrs)                             │
│   ⬜ Section 3.2 (4 hrs)                             │
│   ⬜ Section 3.3 (3 hrs)                             │
│   → Starting: Wednesday                              │
│                                                      │
│ Phase 3: Review [                ] 0%               │
│   ⬜ Self-review (2 hrs)                             │
│   ⬜ Citations (1 hr)                                │
│   ⬜ Polish (2.5 hrs)                                │
│   → Starting: Friday                                 │
│                                                      │
│ Overall: 18% (4.5/23.5 hrs) | On pace ✓             │
│                                                      │
│ [Show Risks] [Show Timeline] [Edit Plan]            │
└──────────────────────────────────────────────────────┘
```

### Full Detail View

```
┌─────────────────────────────────────────────────────────┐
│ 📋 Chapter 3 Plan — Full Details                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ GOAL: Complete 3500-4000 word chapter on ML            │
│ interpretability in clinical contexts                   │
│                                                         │
│ DEADLINE: Friday, March 28 @ 5pm                        │
│ Status: On track (18% complete, 4.5/23.5 hrs)          │
│                                                         │
│ ─────── PHASE 1: RESEARCH (In Progress) ──────         │
│                                                         │
│ [x] 1.1 Retrieve papers (1.2/2.5 hrs) ✓ Done           │
│     23 papers collected from arXiv, IEEE, medical       │
│                                                         │
│ [~] 1.2 Synthesize frameworks (1.2/3 hrs) [=====>      │
│     SHAP, LIME, attention, CAV covered                  │
│     → Wrapping up today, est. +1.8 hrs                  │
│                                                         │
│ [ ] 1.3 Clinical case studies (0/2 hrs)                │
│     → Starting: Tomorrow morning                        │
│                                                         │
│ ─────── PHASE 2: DRAFTING (Not started) ──────          │
│                                                         │
│ [ ] 2.1 Section 3.1 — Methods (4 hrs)                  │
│ [ ] 2.2 Section 3.2 — Clinical examples (4 hrs)         │
│ [ ] 2.3 Section 3.3 — Implications (3 hrs)             │
│ → Starting: Wednesday, March 25                         │
│                                                         │
│ ─────── PHASE 3: REVIEW (Not started) ─────            │
│                                                         │
│ [ ] 3.1 Self-review (2 hrs)                            │
│ [ ] 3.2 Citations (1 hr)                               │
│ [ ] 3.3 Polish (2.5 hrs)                               │
│ → Starting: Friday, March 28                            │
│                                                         │
│ ─────── TIMELINE ────────────────────────              │
│                                                         │
│ Today (Fri 3/21):  Phase 1 cont.                        │
│ Tomorrow (Sat):    Phase 1 complete                     │
│ Sun-Tue:           Phase 2 (parallel: feedback?)        │
│ Wed-Thu:           Phase 2 + early Phase 3              │
│ Friday:            Phase 3 polish                       │
│                                                         │
│ ─────── RISKS ────────────────────────────             │
│                                                         │
│ ⚠️  Risk 1: Literature scope creep                     │
│     Likelihood: Medium | Impact: High                  │
│     Mitigation: Stop at 25 papers, focus on clinical   │
│                                                         │
│ ⚠️  Risk 2: Case studies hard to contextualize         │
│     Likelihood: Medium | Impact: Medium                │
│     Fallback: Use hypothetical examples if needed      │
│                                                         │
│ ✓  Risk 3: Feedback loop timing                         │
│     Mitigated by extended deadline (now Mon)            │
│                                                         │
│ ─────── CROSS-WORKSPACE SYNERGIES ──────              │
│                                                         │
│ 📌 Q2 Budget Analysis:                                 │
│    Statistical interpretation work applies to 3.1       │
│                                                         │
│ 📌 Systems Design Talk:                                │
│    Case studies here could inform interpretability     │
│    framing in your presentation                         │
│                                                         │
│ [Edit Plan] [Add Blocker] [Adjust Deadline]           │
└─────────────────────────────────────────────────────────┘
```

---

## Intervention Points: How Users Steer Plans

Plans are designed for course correction without full re-planning.

### Quick Adjustments (No Plan Revision)

**Delay a task**
```
User: "I can't start case studies today, doing them tomorrow"
Conductor: "Got it. Shift case studies to tomorrow, pushing drafting start to Thursday?
         That keeps us on track."
→ Update task 1.3 date in plan, re-sequence Phase 2 dates
→ Notify if deadline now at risk
```

**Adjust scope**
```
User: "Case studies are taking too long. Pick just 1 strong one instead of 3"
Conductor: "Reduces 1.3 from 2 hours to 1 hour. Saves 1 hour.
         Proceed?"
→ Update task 1.3 estimate, recalculate phase/total hours
→ Likely removes deadline risk
```

**Change priority**
```
User: "Something else came up. Chapter 3 is now lower priority."
Conductor: "Should I pause this plan and focus on the new goal?
         We can resume Chapter 3 when that's done."
→ Mark plan as paused, note reason and resumption trigger
→ Offer to accelerate later if time allows
```

### Major Adjustments (Require Plan Revision)

**Extend deadline**
```
User: "Advisor can't review until next week"
Conductor: [Presents v3 plan update options]
→ Creates new plan version with extended deadline
→ Re-sequences phases to account for feedback cycle
```

**Add/reduce scope**
```
User: "Actually, section 3.3 shouldn't be in this chapter"
Conductor: "Removes Task 2.3 (~3 hours).
         New estimate: 20.5 hours total. Finishes Wed instead of Fri.
         Updated plan?"
→ Creates new version, removes phase/task, updates metrics
```

**Reprioritize vs other goals**
```
User: "Wait, I have a job interview Thursday. Need to prep."
Conductor: [Shows plan conflict]
"Chapter 3 plan requires 5+ hours Wed-Thu. Interview prep also competes.
Options:
A) Pause Chapter 3 until Friday (may miss deadline)
B) Compress Chapter 3 (reduce scope), accelerate to Tuesday
C) Delay interview prep to after Friday
Which priority takes precedence?"
→ Updates plan based on user decision
```

### Intervention via Questions

Rather than forcing a decision, the conductor uses questions to surface issues:

```
User is working on Task 1.2. By hour 2, still 1+ hours remaining.
Velocity = 2x estimate.

Conductor: "You're on Task 1.2 (synthesize frameworks).
          Expected 3 hours total, you've spent 2. Is this task harder
          than we anticipated, or still on track to finish in ~1 hour?"

User: "Yeah, there's more nuance than I thought. Maybe 1.5 more hours."

Conductor: "Understood. If 1.2 takes 3.5 hours instead of 3,
          that's +30 minutes overhead. That's fine — Phase 1 still
          finishes on schedule.

          For Phase 2 (drafting), should I increase estimates there too?
          Or do you think Phase 2 will be more straightforward?"

User: "Phase 2 is more straightforward, my writing is faster than research."

Conductor: "Got it. Keeping Phase 2 estimates as-is. Plan still on track.
          Next: Ready to move to Task 1.3 tomorrow?"
```

---

## Proactivity Calibration: When to Act vs Wait

The conductor must balance helpfulness with autonomy. This is mediated by user modeling.

### Proactivity Levels

#### Level 0: Silent
- Conductor tracks plan silently
- Only intervenes if deadline becomes critically at risk (< 4 hours buffer)
- Minimal notifications
- *User model*: Self-directed, prefers autonomy, rarely needs prompting

#### Level 1: Checkpoints
- Weekly review: "How's the plan going? Anything changing?"
- At phase transitions: "Phase 1 done. Ready for Phase 2?"
- Before critical tasks: "Case studies next. Any blockers?"
- *User model*: Moderately autonomous, benefits from structured check-ins

#### Level 2: Active Monitoring
- Daily status: "You've been in Phase 1 for 1.5 days, on pace"
- Risk flagging: "Velocity is trending 1.3x. Should we adjust Phase 2 estimates?"
- Opportunity highlighting: "Your Q2 Budget work connects here—want to reference it?"
- *User model*: Benefits from regular feedback, risk-averse

#### Level 3: Proactive Guidance
- Suggest next steps: "Ready to move to Task 1.3?"
- Offer help: "Synthesis sounds complex. Want me to draft a framework outline?"
- Pre-surface blockers: "Case studies might be hard to find. Should we search now or Thursday?"
- *User model*: Prefers guidance, less domain-experienced, appreciates scaffolding

#### Level 4: Directive
- Conductor structures work: "Here's your schedule for the week"
- Conductor does background work: "I've gathered 30 papers; pick your 25"
- Conductor offers only one path forward
- *User model*: Prefers clarity, benefits from minimal options, deadline-driven

### Calibrating Proactivity

Conductor infers user's preferred proactivity level from:

1. **Explicit statement**: "I prefer minimal interruptions" (Level 0) vs "I like check-ins" (Level 2)

2. **Behavior patterns**:
   - Does user consult plan regularly? (High engagement → lower proactivity needed)
   - Do deadlines slip without intervention? (Yes → increase proactivity)
   - Does user ignore suggestions? (Yes → lower proactivity, respect autonomy)

3. **Task complexity**:
   - Straightforward tasks → lower proactivity
   - Novel/complex work → increase proactivity
   - Deadline pressure → increase proactivity

4. **Time pressure**:
   - Plenty of buffer → Level 0-1
   - Moderate pressure → Level 2
   - Critical deadline → Level 3-4

### Proactivity Examples

**Scenario: User in Phase 1, velocity trending 1.2x, 5 days to deadline, 15 hours work remaining.**

- **Level 0**: Conductor silent, tracking
- **Level 1**: End-of-day message: "Phase 1 on pace. 5 days, 15 hours work left. Ready for tomorrow?"
- **Level 2**: "Your velocity is trending 1.2x. If Phase 2 follows suit, we'll be tight by Friday. Want to adjust Phase 2 estimates now?"
- **Level 3**: "I'm noticing research is taking longer than expected. Should we reduce scope on case studies (pick 1 strong one) or extend deadline?"
- **Level 4**: "Velocity is 1.2x. I recommend: reduce case studies from 3 to 1 (save 1 hour), accelerate Phase 2 start by 1 day. New deadline: Thursday evening with 2-hour buffer. Proceed?"

---

## Cross-Workspace Planning

The conductor maintains a global view of all workspace plans, enabling resource optimization and surfacing unexpected synergies.

### Cross-Workspace Coordinator Role

The conductor acts as a cross-workspace scheduler:

```
Workspaces (Current State):
├─ Thesis-Chapter3: [========> ] 18% (4.5/23.5 hrs)
│  Deadline: Friday 5pm
│  Phase 1 in progress, Phase 2 starting Wed
│
├─ JobSearch-Applications: [=>      ] 5% (1/20 hrs)
│  Deadline: ASAP (open-ended, but comp deadline Thu)
│  Interview prep starts Wed
│
├─ Q2-Budget-Analysis: [================>  ] 85% (34/40 hrs)
│  Deadline: Monday (COMPLETE before then)
│  Final tweaks, presentation ready
│
└─ Systems-Design-Talk: [=>      ] 10% (2/20 hrs)
   Deadline: 2 weeks (no immediate pressure)
   Planning phase only
```

### Detection Algorithm: Finding Synergies

When multiple workspace plans exist, conductor scans for:

1. **Direct Dependency**
   - Work in one workspace creates prerequisites for another
   - Example: "Q2 Budget analysis contains statistical interpretation section that directly applies to Thesis Chapter 3"

2. **Resource Conflict**
   - Multiple high-deadline workspaces competing for same resource (user's time)
   - Example: "Interview prep Wed-Thu + Chapter 3 Phase 2 + Budget final tweaks = 15+ hours in 2 days"

3. **Content Reuse**
   - Work in one workspace can inform another
   - Example: "Systems Design talk can showcase interpretability frameworks from Chapter 3"

4. **Methodology Transfer**
   - Approaches in one workspace apply to another
   - Example: "Your literature synthesis method for Chapter 3 could accelerate Systems Design research"

### Synergy Reporting

When conductor detects connections, it surfaces them in plan views:

```
📌 CROSS-WORKSPACE SYNERGIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[→] Q2 Budget Analysis (due Monday)
    Your statistical interpretation section
    (currently 85% done) applies directly to
    Chapter 3 Section 3.1.

    Suggestion: Reference that work when synthesizing
    frameworks. Could save 30 minutes research.

[→] Systems Design Talk (2 weeks out)
    You're framing interpretability there too.
    The case studies you're gathering for Chapter 3
    would make strong talk examples.

    Suggestion: Prioritize high-impact clinical
    case studies that also showcase interpretability.

[⚠️] RESOURCE CONFLICT
    Wed-Thu are contested:
    • Chapter 3 Phase 2: 8 hours (Wed-Thu)
    • Job interview prep: 5 hours (Thu)
    • Budget final tweaks: 2 hours (Mon-Wed)

    Total: 15 hours in 2 days available.
    Available: ~10 hours.

    Recommend: Accelerate Budget work to today/tomorrow,
    or defer Systems Design talk planning.
```

### Resource Allocation Decisions

When conflicts detected, conductor offers options:

```
CONFLICT: Interview prep (Wed-Thu) + Chapter 3 Phase 2 (Wed-Thu)

Option A: Prioritize Chapter 3
├─ Allocate 8 hours Wed-Thu to Chapter 3 (on plan)
├─ Defer interview prep to Fri-Sun (after Chapter 3)
└─ Risk: Interview may be mid-week, less prep time

Option B: Prioritize Interview
├─ Allocate 5 hours Wed-Thu to interview (thorough prep)
├─ Compress Chapter 3 Phase 2 to Tue + Fri (9-10 hours total)
└─ Risk: Tight schedule, less polished draft, deadline crunch

Option C: Parallel Path
├─ Chapter 3 Section 3.1 (frameworks): 4 hours Tue-Wed
├─ Interview prep: 5 hours Thu
├─ Chapter 3 Sections 3.2-3.3: 4 hours Fri-Sat
├─ Review: 3 hours Sun
└─ Risk: Chapter 3 deadline pushes to Sunday (verify acceptable?)

Option D: Scope Reduction
├─ Reduce Chapter 3 case studies: 1 instead of 3 (save 1 hour)
├─ Compress Phase 2 to 7 hours (tight but feasible)
├─ Full interview prep 5 hours Thu
└─ Risk: Chapter 3 less comprehensive, interview lighter prep

[User chooses option and confirms]
```

### Living Cross-Workspace Plan

A master plan document aggregates all workspace goals:

**File**: `/.meta/CROSS-WORKSPACE-PLAN.md`

```markdown
# Cross-Workspace Overview

**Current Date**: March 23, 2026
**Next 7 Days**: March 23-29

## All Workspaces at a Glance

| Workspace | Deadline | Status | Risk | Priority |
|-----------|----------|--------|------|----------|
| Thesis Ch3 | Fri 5pm | 18% | Medium (tight) | High |
| Job Search | ASAP | 5% | Low | High |
| Q2 Budget | Mon | 85% | Low | High |
| Systems Talk | 2wks | 10% | Low | Medium |

## Resource Allocation (Next 7 Days)

**Available**: ~35 hours (5 hrs/day)

| Workspace | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|-----------|-----|-----|-----|-----|-----|-----|-----|
| Budget | 1h | 1h | — | — | — | — | — |
| Chapter3 | — | 2h | 4h | 4h | 4h | — | — |
| Interview | — | — | — | 5h | — | 3h | — |
| Systems | — | — | 1h | — | — | — | 1h |
| Slack | 1h | 1h | 1h | 1h | 1h | 1h | 1h |
| **Total** | 2h | 4h | 6h | 10h | 5h | 4h | 2h |

## Dependencies & Synergies

### Q2 Budget → Thesis Chapter 3
- Budget work (due Mon) includes statistical interpretation
- Chapter 3 can reference/adapt that work for Section 3.1
- **Action**: Finish Budget by Sun night, integrate reference Mon

### Chapter 3 → Systems Design Talk
- Case studies gathered for Chapter 3 directly applicable to talk
- **Action**: Prioritize high-impact examples that showcase interpretability

### Interview Prep ← Systems Design Talk
- Systems Design talk is about your research strengths
- Interview prep should align with that narrative
- **Action**: Coordinate talking points between talk prep and interview prep

## Critical Path

**Must complete by Friday**:
- Budget work (due Mon)
- Chapter 3 (due Fri)

**Must keep progressing**:
- Interview prep (ongoing, due ASAP for interviews mid-week/next week)

**Can defer if needed**:
- Systems Design talk (2-week horizon, lower urgency)

## Recommended Action (This Week)

1. **Today-Tomorrow**: Finish Budget analysis, finalize Chapter 3 research
2. **Wednesday**: Budget done, begin Chapter 3 Phase 2 (4 hours)
3. **Thursday**: Chapter 3 Phase 2 (4 hours) + Interview prep (5 hours)
4. **Friday**: Chapter 3 Phase 3 review (4 hours)
5. **Weekend**: Interview prep wrap-up, Systems Design initial research

---

## Risks Across Workspaces

### 🔴 Critical
- **Interview timing unknown**: If interviews are Wed/Thu, heavy conflict with Chapter 3
  - Mitigation: Confirm interview dates ASAP, adjust allocations

### 🟡 Medium
- **Chapter 3 velocity trending 1.2x**: May reduce slack for other workspaces
  - Mitigation: Monitor Phase 2 velocity, be ready to compress Systems work

- **Budget final tweaks taking longer than expected**
  - Mitigation: Hard stop Sunday night, push any remaining to next week

### 🟢 Low
- **Systems Design is 2 weeks out**
  - Can be deferred if timeline pressure increases
  - No immediate risk
```

---

## Relationship: Conductor Plans vs Orchestrator Plans

The conductor maintains high-level workspace plans; orchestrators execute at task level.

### Plan Hierarchy

```
┌──────────────────────────────────────────────────┐
│ Conductor (Cross-Workspace Coordinator)          │
│                                                  │
│ • Maintains plan for each workspace             │
│ • Monitors cross-workspace resource conflicts    │
│ • Detects synergies between workspaces          │
│ • Updates plans when goals/deadlines shift      │
│                                                  │
│ Plans at level: "Complete Chapter 3 by Friday"  │
│ Granularity: Phases (days to weeks)             │
└──────────────────────────────────────────────────┘
           ↓ Delegates to ↓
┌──────────────────────────────────────────────────┐
│ Workspace Orchestrator (Task-Level Executor)     │
│                                                  │
│ • Receives phase from conductor                 │
│ • Breaks phase into hourly/daily tasks          │
│ • Assigns tasks to tools/subagents              │
│ • Monitors task progress, reports back          │
│ • Notifies conductor of blockers                │
│                                                  │
│ Plans at level: "Synthesize frameworks..."      │
│ Granularity: Tasks (hours)                      │
└──────────────────────────────────────────────────┘
           ↓ Enlists ↓
┌──────────────────────────────────────────────────┐
│ Tool/Subagent Layer                             │
│                                                  │
│ • Execute specific operations                   │
│ • Report success/failure                        │
│ • Provide input to orchestrator's next move     │
│                                                  │
│ Plans at level: "Call API X with params Y"      │
│ Granularity: Minutes                            │
└──────────────────────────────────────────────────┘
```

### Information Flow

**Conductor → Orchestrator**:
```
{
  "phase": "Phase 1: Research",
  "tasks": [
    {
      "id": "task-1-1",
      "title": "Retrieve papers",
      "estimatedHours": 2.5,
      "dependencies": [],
      "blockers": ["Need access to arXiv"],
      "fallbacks": [...]
    },
    ...
  ],
  "deadline": "2026-03-22T23:59Z",
  "priority": "high",
  "userModel": {
    "proactivityLevel": 2,
    "preferredCheckpointFrequency": "daily"
  }
}
```

**Orchestrator → Conductor** (Status updates):
```
{
  "timestamp": "2026-03-21T15:30Z",
  "task": "task-1-1",
  "status": "in-progress",
  "timeSpent": 1.2,
  "estimatedRemaining": 1.3,
  "blockers": [],
  "notes": "Found 23 relevant papers",
  "nextTask": "task-1-2",
  "readyForNextPhase": false
}
```

**Orchestrator → Conductor** (Blocker):
```
{
  "timestamp": "2026-03-22T10:00Z",
  "task": "task-1-3",
  "status": "blocked",
  "blockReason": "Harder to find clinical case studies than expected",
  "impact": "May take 3 hours instead of 2",
  "suggestedActions": [
    "Approve 1 additional hour",
    "Reduce scope (pick 1 case study instead of 3)",
    "Use hypothetical examples instead"
  ],
  "requestsUserInput": true
}
```

---

## Implementation Guide

### Step 1: Plan Creation System

Implement a `PlanGenerator` that takes a workspace goal and returns a plan object:

```python
class PlanGenerator:
    def generate(self, goal_statement, context):
        # Input: user goal + workspace history
        # Output: Plan object with phases, tasks, estimates

        # Process:
        # 1. Parse goal into success criteria
        # 2. Decompose into phases
        # 3. Estimate duration per task
        # 4. Identify blockers/risks
        # 5. Return Plan object
```

### Step 2: Plan Monitoring Service

Implement monitoring that tracks task completion and flags deviations:

```python
class PlanMonitor:
    def update_task_status(self, task_id, status, actual_hours):
        # Log task completion
        # Recalculate velocity
        # Check deadline pressure
        # Trigger plan update if needed

    def detect_deviations(self, plan):
        # Identify tasks taking >1.3x estimate
        # Flag missing blockers
        # Check deadline buffer
        # Return list of detected issues

    def trigger_update(self, plan, reason):
        # Create new plan version
        # Update estimates based on velocity
        # Notify user of changes
```

### Step 3: Visible Plan Rendering

Render plans to markdown + task panel UI:

```python
class PlanRenderer:
    def render_markdown(self, plan):
        # Generate PLAN.md in workspace
        # Include: goal, timeline, tasks, risks, next steps

    def render_ui_summary(self, plan):
        # Render task panel summary view
        # Show: progress %, current phase, deadline, on-track status

    def render_ui_full(self, plan):
        # Render detailed task panel view
        # Show: all phases, all tasks, risks, cross-workspace synergies
```

### Step 4: Cross-Workspace Coordinator

Implement conductor logic for synergy detection and resource allocation:

```python
class CrossWorkspaceCoordinator:
    def detect_synergies(self, plans):
        # Input: all active workspace plans
        # Output: list of detected connections

        # Check for:
        # - Content reuse (same topic across workspaces)
        # - Methodology transfer
        # - Direct dependencies

    def detect_conflicts(self, plans):
        # Input: all active plans
        # Output: resource conflicts

        # Check for:
        # - Simultaneous deadlines
        # - Time allocation overload
        # - Competing priorities

    def suggest_allocations(self, conflicts):
        # Input: detected conflicts
        # Output: allocation options
```

### Step 5: Proactivity Calibration

Implement user modeling and proactivity scheduling:

```python
class ProactivityCalibrator:
    def infer_user_preference(self, interaction_history):
        # Analyze how user interacts with plans
        # Return proactivity level (0-4)

    def schedule_checkpoint(self, plan, proactivity_level):
        # Based on level, schedule next check-in
        # Level 0: None
        # Level 1: At phase transitions
        # Level 2: Daily
        # Level 3: Multiple times per day
        # Level 4: Continuous
```

---

## Summary

The planning and reasoning system transforms the conductor from a reactive executor to a proactive goal-aware collaborator:

1. **Plan Creation**: Goals → structured task decomposition with estimates, dependencies, risks
2. **Plan Representation**: Rich JSON schema + living markdown document
3. **Plan Monitoring**: Continuous tracking with velocity analysis and deviation detection
4. **Plan Updating**: Triggered by velocity patterns, blockers, context shifts; preserves history
5. **Visible Planning**: User sees task panel with progress, next steps, risks—builds trust and enables intervention
6. **Proactivity Calibration**: Balanced based on user model, task complexity, deadline pressure
7. **Cross-Workspace Coordination**: Detects synergies, allocates resources, flags conflicts
8. **Orchestrator Integration**: Conductor sets direction; orchestrators execute with feedback loop

The system maintains multiple levels of plan simultaneously—high-level conductor goals, mid-level orchestrator phases, low-level tool operations—with clear information flow upward (status, blockers) and downward (direction, constraints).

Plans are persistent, participatory, and transparent: not hidden chain-of-thought, but visible reasoning that builds user trust and enables course correction.
