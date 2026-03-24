# Document 17: Learning and Adaptation System
## LLM-Native Operating System Specification

**Status:** Core System Design
**Version:** 1.0
**Date:** 2026-03-23

---

## Executive Summary

The LLM-native OS learns through continuous observation, pattern detection, and user feedback. Rather than requiring explicit training, the system watches how users work, identifies recurring patterns, and proposes learned behaviors with increasing confidence. This "replay and teach" approach builds procedural memory organically while respecting user autonomy and managing permission friction.

Three core mechanisms drive learning:
1. **Observation System**: Passive tracking of user actions and environmental states
2. **Pattern Detection**: Statistical and heuristic identification of recurring behaviors
3. **Proposal Mechanism**: Gentle, non-intrusive suggestions that improve over time

Learning is constrained by four key principles: transparency (user always knows what was learned), reversibility (learned patterns can be rejected or disabled), contradiction handling (distinguishing deliberate changes from exceptions), and graceful decay (patterns fade if not reinforced).

---

## 1. The Observation System

### 1.1 What Gets Observed

The OS maintains continuous passive observation across multiple dimensions:

#### Action Sequences
- Window movements and resizing patterns
- File operations (creation, movement, deletion, organization)
- Editor actions (selection, navigation, editing patterns)
- Terminal commands and their context
- Application switching and switching frequency
- Keyboard shortcuts and mouse workflows

**Observation Detail:**
```yaml
action_observation:
  temporal:
    - timestamp: ISO 8601 with millisecond precision
    - duration: time spent in action or context
    - sequence_position: position in larger action sequence

  contextual:
    - precursor_action: what immediately preceded this
    - application_state: state of relevant applications
    - working_directory: current context (if file-related)
    - user_stated_goal: did user verbally state what they're doing?

  environmental:
    - screen_configuration: monitor arrangement, resolution
    - visible_applications: what was on screen
    - time_of_day: temporal clustering pattern
    - day_of_week: weekly patterns
    - project_context: which project/task is active
```

#### Decision Points and Confirmations
- Which options user selects when presented with choices
- How user responds to permission requests (approve/deny/modify)
- Whether user overrides automatic suggestions
- Corrections user makes to OS-generated content or decisions

#### Spatial Patterns
- Preferred window layouts for different activities
- Application arrangement during debugging vs. writing vs. reading
- Screen real estate allocation patterns
- Desktop organization preferences

#### Temporal Patterns
- When tasks typically occur (morning debugging, afternoon writing)
- Duration of focused work blocks
- Switching frequency and context-switching patterns
- Time-of-day task preferences

### 1.2 What Does NOT Get Observed

Privacy boundaries are strict and non-negotiable:

- **Content Privacy**: The OS does NOT log the full text of files, emails, messages, or documents being edited. Only metadata is captured (file size, language, document type, edit counts).
- **Sensitive Information**: No credentials, tokens, passwords, or sensitive data entered into forms are logged for pattern learning.
- **Communication Privacy**: The content of emails, messages, or comments is not observed. Only the fact that communication occurred and communication patterns (frequency, timing) are tracked.
- **Search Queries**: Search terms and browsing history are not used for learning (though browsing frequency might be).
- **Biometric Data**: Keystroke timing, mouse movement patterns, and other biometric signals are not captured.

Users can audit what's being observed at any time:
```
/settings/observation/audit-log
```

---

## 2. Pattern Detection Algorithms

### 2.1 Sequence Pattern Detection

The system identifies recurring sequences of actions that form meaningful procedures.

#### Algorithm: N-gram with Context Clustering

```yaml
sequence_detection:
  mechanism: "N-gram analysis with contextual weighting"

  process:
    1. Capture action sequences of varying lengths (trigrams, 4-grams, 5-grams)
    2. Weight by temporal context (time of day, project type)
    3. Cluster similar sequences accounting for variations
    4. Calculate confidence scores based on:
       - frequency: how often sequence repeats
       - consistency: variations vs. exact matches
       - recency: recent patterns weighted higher
       - success_outcome: did sequence achieve stated goal?

  example:
    - observed: [switch_to_editor, create_new_file, check_syntax, run_tests] × 47 times
    - variations: [switch, create, syntax] × 43 times (runs without explicit check)
    - pattern_extracted: "code_creation_workflow"
    - confidence: 0.89 (high consistency, high frequency)
    - current_confidence: 0.91 (improved based on recent reinforcement)
```

**Confidence Decay Formula:**
```
confidence(t) = baseline_confidence × (0.95 ^ (days_since_last_observation / 7))
```

If a pattern hasn't been observed in 6 weeks, confidence decays to 78% of baseline. This allows for seasonal or project-based patterns.

### 2.2 Decision Pattern Detection

The OS learns which decisions the user consistently makes in similar contexts.

#### Algorithm: Decision Tree with Context Matching

```yaml
decision_learning:
  mechanism: "Context-aware decision classification"

  process:
    1. When decision point encountered, record:
       - decision_type: what choice was made?
       - context: project, time, state, precursor actions
       - outcome: was choice successful? did user later change it?
       - user_explanation: if user verbalized reasoning

    2. Cluster similar contexts using:
       - project_type matching
       - temporal similarity
       - preceding_action patterns
       - environmental_state matching

    3. Calculate decision pattern:
       - "When debugging Test files on Monday mornings, user selects 'verbose' log level 87% of the time"
       - "When reviewing unfamiliar code, user always opens file tree first"
       - "When writing documentation, user disables notifications in 92% of cases"

  confidence_factors:
    - cluster_size: patterns from 10+ similar contexts are stronger
    - consistency: if choice varies, factor in what predicted the variation
    - recent_changes: flag if pattern recently changed
    - explicit_instruction: user's stated preferences override learned patterns
```

### 2.3 Spatial Pattern Detection

Window layouts and arrangement patterns cluster by activity type.

```yaml
spatial_learning:
  mechanism: "Activity-based layout templates"

  observed_layouts:
    - activity: "debugging"
      layouts_seen: [editor_left_terminal_right, editor_full_terminal_overlay, three_column]
      frequency_distribution:
        editor_left_terminal_right: 0.67
        editor_full_terminal_overlay: 0.22
        three_column: 0.11

      trigger_conditions:
        - when: user opens debugger
        - when: project contains test files
        - when: time_of_day matches historical debugging time

      current_layout_preference: "editor_left_terminal_right"
      confidence: 0.78

    - activity: "writing_documentation"
      layouts_seen: [editor_full_with_preview, editor_narrow_reference_panel]
      primary: "editor_full_with_preview"
      confidence: 0.84
```

### 2.4 Permission Evolution Learning

The system learns which confirmation requests users want based on historical responses.

```yaml
permission_learning:
  mechanism: "Bayesian estimation of user risk tolerance"

  for_each_action_type:
    data:
      - times_confirmed: count
      - times_denied: count
      - times_overridden_later: count
      - times_requested_faster_approval: count (user impatience signals)
      - times_modified_before_approval: count

    calculated:
      - approval_rate: confirmed / (confirmed + denied)
      - override_rate: overridden / total
      - impatience_signal: requests for faster approval

    adaptation:
      - if approval_rate > 0.95: consider elevating to autonomous mode
      - if approval_rate < 0.20: flag as action user dislikes, reduce proposals
      - if override_rate > 0.30: action parameters don't match user preferences
      - if impatience_signal > 0: user wants less friction in this area

  example:
    action_type: "save_and_commit_changes"
    confirmed: 234
    denied: 8
    approval_rate: 0.966
    override_rate: 0.042
    recommendation: "Candidate for autonomous mode elevation"
```

---

## 3. The Proposal Mechanism

### 3.1 Design Principles

Proposals must be:
- **Explicit**: User always knows a proposal was made
- **Low-Friction**: Accepted via a single action, rejected via a single action
- **Contextual**: Appear when most relevant
- **Cumulative**: Reinforced patterns strengthen confidence; contradictions flag uncertainty
- **Deferrable**: User can dismiss proposals without teaching the opposite pattern

### 3.2 Proposal Types and Triggers

#### Type 1: Observed Pattern Suggestion
Triggered when the OS has high confidence in a repeated pattern.

```yaml
proposal_type: "observed_pattern"

example:
  pattern: "user opens file tree before reviewing unfamiliar code"
  confidence: 0.87
  times_observed: 34

  trigger:
    - user opens unfamiliar code file
    - file_tree NOT currently visible
    - confidence > 0.80

  presentation:
    mode: "inline_suggestion"
    icon: "lightbulb"
    text: "I've noticed you usually open the file tree when reviewing new code. Want me to do that?"
    actions: ["Yes", "No", "Always for this type", "Never suggest this"]
    dismissal_timeout: 5 seconds (if user ignores, dismiss gently)
```

#### Type 2: Context-Matched Decision
Triggered when OS detects a similar context to one where user made a consistent decision.

```yaml
proposal_type: "decision_match"

example:
  decision: "When editing test files on Monday mornings, request verbose logging"
  context_match: 0.82
  prediction: "enable verbose logging"

  trigger:
    - user opens test file
    - time_of_day is 09:00-12:00
    - day_of_week is Monday
    - confidence > 0.75

  presentation:
    mode: "action_suggestion"
    text: "Based on your pattern, enable verbose logging?"
    actions: ["Yes", "No, not this time"]
```

#### Type 3: Efficiency Opportunity
Triggered when the OS detects a manual pattern that could be automated.

```yaml
proposal_type: "efficiency_opportunity"

example:
  observed_manual_pattern: "user moves terminal window below editor every debug session"
  frequency: 48 times this month
  estimated_time_savings: ~45 seconds per session

  trigger:
    - user enters debugging context
    - terminal is not in preferred position
    - pattern confidence > 0.70

  presentation:
    mode: "card_notification"
    text: "I've noticed you always move the terminal below the editor when debugging. Want me to do that automatically?"
    actions: ["Yes, always", "Ask next time", "No"]
```

#### Type 4: Contradiction Flag
Triggered when user does something contradictory to learned pattern.

```yaml
proposal_type: "contradiction_flag"

example:
  learned_pattern: "user selects verbose logging in 87% of debugging sessions"
  observation: "user selected minimal logging in similar context"

  presentation:
    mode: "gentle_notification"
    text: "I noticed you chose minimal logging this time (usually you prefer verbose). Is this deliberate, or should I reset the pattern?"
    actions: ["This is intentional", "Revert to verbose", "Ignore this"]
```

### 3.3 Proposal Presentation Guidelines

**Frequency Management:**
- No more than 3 proposals per hour when user is focused (detected via activity patterns)
- Cluster proposals: present multiple related suggestions together
- Batch low-importance proposals into a daily digest
- During high-focus periods (continuous typing, debugging), defer non-urgent proposals

**Presentation Context:**
- Proposals appear in proposal panel (lower right, collapsible)
- Important proposals (safety-related, permission changes) interrupt but minimize
- Routine proposals (layout, efficiency) queue and batch
- Dismissed proposals can be reviewed later in `/settings/learning/proposal-history`

**User Signals of Impatience:**
```yaml
impatience_indicators:
  - rapid_dismissal: user dismisses within 0.5 seconds
  - negation_patterns: user consistently says "no" to proposal type
  - manual_override: user does opposite of suggested action
  - explicit_request: user asks to reduce proposals
  - verbal_cues: user says "stop asking about this"

response:
  - track per proposal type and context
  - reduce future proposals of that type by 50%
  - offer "mute this suggestion type" option
  - provide `/settings/learning/proposal-silence` for batch control
```

---

## 4. Confirmation and Storage: Pattern Becoming Procedural Memory

### 4.1 Confirmation Flow

When user approves a proposal or confirms a pattern:

```yaml
confirmation_flow:
  1_explicit_confirmation:
    - user clicks "Yes" or "Always" or approves action
    - timestamp recorded
    - context fully captured

  2_implicit_confirmation:
    - user executes the suggested action manually (after OS suggested it)
    - counts as partial confirmation (weaker signal)
    - "user did what we suggested" reinforces pattern

  3_pattern_reinforcement:
    - successful outcome observed (user didn't undo action)
    - no contradiction detected in subsequent actions
    - confidence score increases by 0.02-0.05 per confirmation

  4_procedural_storage:
    - pattern moves from episodic memory (specific instances)
    - to procedural memory (generalized procedure)
    - indexed by context clusters and trigger conditions
    - made available for automation
```

### 4.2 Storage Structure

Confirmed patterns stored in procedural memory with full metadata:

```yaml
procedure_record:
  id: "proc_debug_terminal_layout_467"

  procedure_name: "debug_setup_window_layout"

  trigger_conditions:
    - activity_type: "debugging"
    - confidence_threshold: 0.75
    - contexts_matched: ["test_file_opened", "debugger_activated"]
    - recency_factor: 0.91

  actions:
    - position_editor: "left_half"
    - position_terminal: "right_half"
    - terminal_height_ratio: 0.35
    - editor_width_ratio: 0.65

  learning_metadata:
    - first_observed: "2026-01-15T09:32:00Z"
    - last_observed: "2026-03-20T10:15:00Z"
    - total_confirmations: 47
    - total_rejections: 2
    - override_rate: 0.042
    - confidence_score: 0.89
    - confidence_decay_rate: 0.95

  context_clusters:
    - project_type: "backend_service"
    - time_of_day: "morning"
    - day_of_week: ["monday", "tuesday", "wednesday"]

  user_control:
    - automation_enabled: true
    - proposal_enabled: true
    - user_override_preference: "request_confirmation_first"
    - silence_until: null
```

### 4.3 Conflict Resolution in Storage

When multiple patterns match a single context:

```yaml
conflict_resolution:
  scenario: "user has two layouts for debugging"
  pattern_A:
    context_match: 0.88
    confidence: 0.85
    triggers: ["test_debugging", "morning", "backend_project"]

  pattern_B:
    context_match: 0.82
    confidence: 0.79
    triggers: ["ui_debugging", "afternoon", "frontend_project"]

  resolution_strategy:
    1_perfect_context_match: "use most specific match"
    2_partial_match: "rank by confidence and recency"
    3_tied_confidence: "present both as options"
    4_user_preference: "check user's stated preference"
    5_fallback: "request user input, learn preference"
```

---

## 5. Permission Evolution

### 5.1 Three Permission Modes

The OS starts in supervised mode and can evolve per action type.

#### Mode 1: Supervised (Default Initial)
- OS requests confirmation for all non-trivial actions
- User must explicitly approve before action executes
- Appropriate for: new action types, high-consequence actions, user new to OS

```yaml
supervised_behavior:
  trigger: any_action_requiring_permission

  flow:
    1. OS presents action with full context
    2. User can: approve, deny, modify, skip
    3. OS logs decision and context
    4. after N confirmations, evaluate for elevation

  elevation_criteria:
    - approval_rate > 0.95
    - no recent denials (< 5%)
    - no recent overrides (< 10%)
    - pattern confirmed in 20+ contexts

  elevation_timeline: typically 2-4 weeks of regular use
```

#### Mode 2: Autonomous (Evolution)
- OS executes learned actions without confirmation
- User can always review in action logs
- OS proactively alerts only if unexpected outcomes
- Appropriate for: high-confidence, low-consequence actions, user trusts OS

```yaml
autonomous_behavior:
  trigger: permission_elevation_criteria_met

  requirements:
    - approval_rate >= 0.95
    - 20+ confirmations in varied contexts
    - zero recent contradictions
    - pattern age >= 2 weeks

  execution:
    - OS executes action silently
    - logs action to `/activity/autonomous-actions`
    - user can review: `/settings/learning/autonomous-actions`

  safety_valve:
    - if outcome unexpected, alert user
    - if action attempted but failed, log and propose
    - user can downgrade to supervised instantly
```

#### Mode 3: Custom (User-Configured)
- User explicitly sets rules for each action type
- Syntax: condition-based triggers and approval thresholds
- Appropriate for: power users, specific workflows, hybrid approaches

```yaml
custom_permission_rules:
  example_rule_1:
    action: "save_and_commit"
    condition: "project_type == backend AND time_in_morning"
    permission: "autonomous"

  example_rule_2:
    action: "delete_file"
    condition: "file_in_trash"
    permission: "supervised_quick_approve"

  example_rule_3:
    action: "run_tests"
    condition: "all"
    permission: "autonomous"

  syntax:
    - condition: logical expression over context variables
    - permission: "autonomous" | "supervised" | "supervised_quick" | "denied"
    - order: rules evaluated top-to-bottom, first match applies
```

### 5.2 Permission Friction Reduction

As user patterns become clear, confirmation friction decreases organically.

```yaml
friction_reduction_mechanisms:

  1_smart_defaults:
    - OS pre-fills confirmation dialogs with learned preference
    - user can approve with single keystroke (⏎ or spacebar)
    - if user hasn't changed default in 10+ instances, consider autonomous

  2_context_awareness:
    - if OS is 95%+ confident in action, skip explicit confirmation
    - if in high-focus context (debugging, writing), defer non-urgent confirmations
    - if action is reversible, lower confirmation bar

  3_batch_confirmations:
    - group similar actions: "approve all test runs for next hour?"
    - allow blanket approvals: "always approve save operations"
    - provide time-limited permissions: "approve all commits until 5pm"

  4_implicit_approval:
    - if user executes suggested action manually, count as confirmation
    - if user doesn't revert automatic action, counts as implicit approval
    - two implicit approvals = one explicit approval (in confidence scoring)

  5_user_control:
    - `/settings/permissions/friction-level`: user can set preference (relaxed/moderate/strict)
    - `/settings/permissions/per-action`: granular control over each action type
    - "bypass permissions until explicit re-enable": power user override
```

---

## 6. Handling Contradictory Signals

### 6.1 Distinguishing Deliberate Change from One-Off Exception

The system must gracefully handle cases where user actions contradict learned patterns.

```yaml
contradiction_detection:
  observation: "user disabled verbose logging (usually enables it)"

  analysis_steps:

    1_context_comparison:
      current_context:
        - time: 10:30 (within debugging hours)
        - project: backend (matches historical pattern)
        - day: Monday (matches historical pattern)
        - file_type: test (matches historical pattern)

      historical_context: matches 92%

      implication: "This looks like a contradiction, not a context mismatch"

    2_signal_strength_check:
      explicit_signal: "user selected 'minimal' from dropdown"
      signal_strength: "strong" (deliberate action, not accidental)

      if_weak: "likely accidental, don't count as contradiction"
      if_strong: "likely deliberate, investigate"

    3_precursor_check:
      did_user_verbalize?: "No stated reason"
      did_user_seem_hurried?: "No (typing speed normal)"
      was_action_explicit?: "Yes (conscious selection)"

      implication: "Deliberate choice, not accidental"

    4_outcome_observation:
      what_happened_next?:
        - did user revert?: No
        - did user seem satisfied?: Yes (continued working)
        - did user comment?: No

      outcome_indicates: "user is intentionally using different setting"
```

### 6.2 Learning from Contradictions

When contradiction is detected:

```yaml
response_to_contradiction:

  immediate:
    - flag in proposal system: "learned pattern may have changed"
    - present gentle notification: "I noticed you chose differently this time"
    - offer explanation mechanism: "Is this deliberate?"

  if_user_confirms_deliberate:
    - reduce confidence in old pattern by 0.15
    - if multiple contradictions in same context: confidence drops 0.40
    - after 3+ contradictions: pattern moved to "uncertain" category
    - proposal mechanism backs off: stops suggesting old pattern

  if_user_indicates_exception:
    - don't reduce pattern confidence
    - flag this context as "exception": specific context where pattern doesn't apply
    - future proposals: "usually you prefer X, but in this specific case you prefer Y"

  if_user_ignores_notification:
    - wait for additional data
    - if contradiction repeats in 2+ similar contexts: treat as deliberate change
    - if contradiction is isolated: treat as one-off exception

  pattern_revision:
    old_pattern: "verbose logging in 87% of debugging sessions"

    after_contradiction: "verbose logging in 84% of debugging sessions, except when [new_context]"

    if_multiple_exceptions: break pattern into sub-patterns for different contexts
```

### 6.3 Permission Contradiction Learning

When user denies an action, but later approves similar actions:

```yaml
scenario: "user denied 'save and commit' twice, then enabled it in supervised mode"

analysis:
  - two denials: user seemed unsure
  - later approvals: user appears comfortable
  - signal: user needed time to build confidence, not fundamental objection

  response:
    - don't reduce pattern confidence dramatically
    - reset "deny" count (user changed mind)
    - watch for pattern: if approvals continue, elevate toward autonomous
    - provide feedback: "You've approved this 12 times. Want me to do it automatically?"
```

---

## 7. Decay and Unlearning

### 7.1 Confidence Decay Formula

Patterns fade if not reinforced, modeling natural forgetting and seasonal variation.

```yaml
decay_mechanism:
  formula: "confidence(t) = baseline × decay_factor ^ (days_elapsed / decay_half_life)"

  parameters:
    baseline: initial confidence when pattern confirmed
    decay_factor: 0.95 (5% loss per decay period)
    decay_half_life: 14 days (pattern loses 50% confidence in 2 weeks)

  reasoning:
    - patterns not reinforced are less likely to be current
    - seasonal variation: winter patterns may not apply in summer
    - project changes: patterns specific to past projects fade
    - but full removal takes months (patterns aren't forgotten, just lower confidence)

  example:
    pattern_confirmed: "2026-02-01"
    baseline_confidence: 0.85
    today: "2026-03-23" (50 days elapsed)

    calculation:
      decay_factor ^ (50 / 14) = 0.95 ^ 3.57 = 0.83
      confidence(today) = 0.85 × 0.83 = 0.705

    proposal_still_made: yes (above 0.70 threshold)
    but_lower_priority: yes (weaker signal than fresher patterns)
```

### 7.2 Automatic Unlearning

Patterns are removed from active use when:

```yaml
removal_criteria:

  confidence_too_low:
    - confidence < 0.40: pattern essentially forgotten
    - moved to "archived" status, not actively proposed
    - can be manually retrieved from history

  explicit_user_request:
    - user says "stop suggesting this"
    - pattern marked "muted" until user re-enables
    - confidence doesn't decay, just visibility disabled

  repeated_contradictions:
    - 5+ contradictions in recent context window
    - pattern assumed no longer valid
    - moved to "archived" with notification: "This pattern seems outdated. Want me to relearn it?"

  project_completion:
    - if pattern is project-specific and project marked complete
    - pattern archived (not deleted)
    - can be restored if user reactivates project

  time_threshold:
    - pattern not observed or reinforced for 6 months
    - confidence decayed to < 0.50
    - user can request permanent archival

archival_process:
  - pattern remains in system, visible in `/settings/learning/archived-patterns`
  - user can restore: "Re-enable this pattern"
  - if restored and immediately contradicted, pattern is deleted
  - simple unlearning: user can request "forget this pattern completely"
```

### 7.3 Seasonal and Cyclical Pattern Management

Some patterns are seasonal (e.g., debugging frequency varies by project phase).

```yaml
cyclical_pattern:
  pattern: "debugging_intense_during_development_phase"

  cyclical_metadata:
    - period: "per project phase" (design, development, testing, maintenance)
    - phase_detection: inferred from project state, file changes, task descriptions
    - confidence_per_phase:
        development: 0.88
        testing: 0.81
        maintenance: 0.45

  behavior:
    - when in development phase: high confidence in "debugging_intensive" patterns
    - when in testing phase: moderate confidence
    - when in maintenance phase: low confidence (but keep pattern alive)
    - when phase detection uncertain: use overall weighted confidence

  user_control:
    - `/settings/learning/cyclical-patterns`: view and configure
    - user can manually set current phase
    - user can enable/disable cycle detection per pattern
```

---

## 8. Relationship to Memory Layers

The learning system integrates all four memory layers:

### 8.1 Episodic Memory as Raw Data

```yaml
episodic_memory_role:
  - stores: specific instances of actions and decisions
  - raw_material: "at 2026-03-20 10:15, user opened file tree when reviewing new code"
  - retention: varies by importance (high-value episodes kept longer)
  - used_for: validating patterns, detecting contradictions, answering "did you do this before?"

  example_queries:
    - "show me all times user opened terminal after switching editors"
    - "what was user doing when they chose verbose logging?"
    - "how many times did user revert this action after I suggested it?"
```

### 8.2 Semantic Memory as Context

```yaml
semantic_memory_role:
  - stores: facts about user, projects, preferences, system state
  - used_for: contextualizing patterns, understanding meaning
  - enables: "user prefers verbose logging because they debug backend systems"

  example_facts:
    - "project_type[backend] = { debugging_intensive: true, testing_heavy: true }"
    - "user_preference[terminal_position] = below_editor"
    - "time_of_day[morning] = high_focus, low_interruption_tolerance"
```

### 8.3 Procedural Memory as Learned Patterns

```yaml
procedural_memory_role:
  - stores: confirmed patterns ready for automation
  - structure: if-then-execute: trigger conditions → actions
  - confidence: continuous value based on learning history
  - used_for: proposing actions, automation, permission evolution

  example_procedures:
    - if_debugging_and_editor_visible: position_terminal_below
    - if_writing_documentation: disable_notifications_and_open_preview
    - if_reviewing_unfamiliar_code: open_file_tree_first
```

### 8.4 Skill Memory as Expertise

```yaml
skill_memory_role:
  - stores: patterns about how OS should assist with specific tasks
  - learned: through observation of user repeatedly performing tasks
  - enables: OS can apprentice and improve

  example_skills:
    - code_review_protocol: "always check methodology first, then novelty, then writing"
    - debugging_approach: "reproduce error first, then trace back, then check assumptions"
    - documentation_writing: "start with overview, then examples, then edge cases"

  skill_expression:
    - natural_language: "when reviewing papers, check methodology first"
    - procedural: sequence of steps inferred from observation
    - conditional: "this protocol applies to [context_type]"
```

---

## 9. Integration with Permission System

Learning and permissions co-evolve:

```yaml
permission_evolution_timeline:

  week_1_supervised:
    - user_approval_rate: learning begins
    - all_actions_require_confirmation
    - proposals_not_yet_made: insufficient data

  week_3_early_patterns:
    - user_approval_rate: ~0.85 for some actions
    - proposals_begin: gentle suggestions for high-confidence patterns
    - permission_unchanged: still supervised, building confidence

  week_6_elevation_criteria:
    - action_save_documents:
        approval_rate: 0.96
        times_confirmed: 89
        times_denied: 4
        recommendation: "candidate for autonomous"

    - user_education: "I've learned that you approve saving documents 96% of the time. Want me to do this automatically?"
    - user_choice: "yes" → permission elevated to autonomous for this action

  ongoing_monitoring:
    - if_approval_rate_drops: revert to supervised
    - if_approval_rate_climbs: consider further automation
    - if_contradiction_detected: flag and investigate
```

---

## 10. Concrete Learning Scenarios

### Scenario 1: Layout Learning

**Observation Phase:**
```
User action sequence (observed 43 times):
1. Click debugger button
2. Terminal appears (floating, centered)
3. User drags terminal to right side
4. User resizes terminal to approximately 35% height
5. User positions editor on left side
6. User starts debugging

Variations observed:
- 38/43 times: terminal positioned below-right
- 3/43 times: terminal positioned right-only
- 2/43 times: terminal as bottom panel
- Average completion time: 23 seconds per session
```

**Pattern Detection:**
```
Pattern extracted: "debug_terminal_layout"
Confidence: 0.89 (high consistency, high frequency)
Context: triggered when debugger button clicked
Variations: minor (mostly the same arrangement)
Time investment: 23 seconds × 43 times = ~16.5 minutes saved if automated
```

**Proposal:**
```
Trigger: user clicks debugger button, terminal not in preferred layout
Proposal: "I've noticed you always move the terminal to below-right when debugging.
           Want me to do that automatically?"
User response: "Yes"
Confirmation: Pattern confirmed, moved to procedural memory
Next time: Terminal automatically positioned, no proposal needed
```

**Evolving:**
```
Approvals: 47 (including the 4 since first proposal)
Denials: 0
Override rate: 0%
Confidence: 0.91 (increased from 0.89 due to reinforcement)

After 20 more approvals:
Elevated to autonomous mode
Terminal layout applied automatically
User alerted: "I'm now automatically arranging your terminal layout when debugging"
```

---

### Scenario 2: Permission Pattern Learning

**Observation Phase:**
```
Action: "commit_changes"
Approval history:
- Prompted 15 times, approved 14 times, denied 1 time
- Approval rate: 93%
- User occasionally overrides to add additional changes: 2/15 times
- User verbally: "I trust you to commit, but always show me the summary first"

Decision patterns detected:
- User always approves if commit message is clear and auto-generated
- User requests changes if commit groups unrelated changes
- User denies if file changes seem larger than expected
```

**Pattern Analysis:**
```
Pattern: "user trusts automatic commits when message is clear"
Confidence: 0.85 (good approval rate, but some denials)
Limiting factors: requires good commit message (depends on heuristics)
                  can't automate without risking approval rate drop

Learned preference: "not quite ready for full autonomy"
Next step: improve commit message heuristics, then try again in 2 weeks
```

**Proposal:**
```
Current permission level: supervised
User feedback: "I wish you'd stop asking me to confirm commits"

OS response: "I've learned you approve commits 93% of the time.
             Your main concern is the commit message.
             What if I show you the message first and ask to confirm,
             but skip the full diff review?"

User: "That would be better"

New rule created:
  condition: auto_commit
  show: commit_message
  confirm: yes_no
  skip: full_diff
```

**Evolution:**
```
After 30 more commits with new simplified confirmation:
- Approval rate: 97%
- User feedback: "Much better, but can you just do it automatically?"
- Confidence threshold met

OS: "I'm elevating commit actions to autonomous mode.
     You'll see the commit in your activity log afterwards."

User: "Perfect"

Permission elevated: autonomous (with safety valve for unusual cases)
```

---

### Scenario 3: Contradiction and Learning

**Initial Pattern:**
```
Observation: User selects verbose logging in debugging sessions
- First 20 times: verbose selected 17/20 times (85%)
- Pattern confidence: 0.82
- Proposed and approved by user

Next 10 observations: verbose selected 9/10 times (90%)
- Pattern confidence: 0.86 (increased)
```

**Contradiction Detected:**
```
Today's debugging session:
- OS proposes: "Enable verbose logging?"
- User selects: "Minimal logging" (contradicts pattern)
- OS response: gentle notification appears

Notification: "I noticed you chose minimal logging this time.
              That's different from your usual preference.
              Is this intentional, or should I suggest verbose next time?"

User response: "Just for this session, I want to see less noise"
```

**Learning from Exception:**
```
Analysis:
- User explicitly indicated this is one-off, not a pattern change
- Context: same project, same time of day, same debugging session type
- Signal: deliberate choice, not contradiction

OS action:
- Don't reduce pattern confidence (user confirmed pattern still valid)
- Flag context: "when debugging this specific function, user prefers minimal"
- Create sub-pattern: logging preference varies by debugging target

Updated pattern:
- "verbose logging in 90% of debugging sessions"
- EXCEPT: "minimal logging when debugging [this_function]"
- Confidence in main pattern: 0.85 (unchanged)
- Confidence in exception: 0.60 (needs more data)
```

**Reapplication:**
```
Two weeks later:
- User debugging same function again
- OS now offers both: "Verbose (your usual) or minimal (like last time you debugged this)?"
- User selects: minimal

Exception confidence: 0.65 (context matched a second time)

Month later:
- Exception confidence: 0.70
- OS: "I've learned you prefer minimal logging for this specific function.
       Want me to set it automatically next time?"
- User: "Yes, that's right"

New autonomous procedure created specifically for this function
```

---

### Scenario 4: Decay and Unlearning

**Pattern Lifecycle:**
```
Jan 1: Pattern confirmed: "intensive debugging on Monday mornings"
       Confidence: 0.88

Jan 28: Project phase changed (moved from development to testing)
        Debugging frequency drops significantly
        Pattern still proposed occasionally (confidence still 0.82)

Feb 25: Pattern not reinforced in 4 weeks
        Confidence decayed to 0.68
        Proposals reduced in frequency
        OS doesn't actively suggest anymore

Mar 23: Pattern not reinforced in 12 weeks
        Confidence decayed to 0.45
        Removed from active proposal system
        Archived in `/settings/learning/archived-patterns`

If user says: "Start suggesting this again"
Response: "Pattern restored from archive. Will need ~3 confirmations to re-activate"
```

**Seasonal Pattern:**
```
Original pattern: "debugging_intensive_in_development_phase"
Project entered testing phase
Confidence adjusted based on phase detection
New confidence: 0.50 (testing phase has lower debugging intensity)

When project phase detected to change:
OS: "I've learned you debug less during testing phases.
     Should I update my expectations?"
User: "Yes, it's usually quieter then"

Cyclical pattern activated
Confidence now context-dependent: phase_aware
```

---

## 11. User Controls and Transparency

### 11.1 Learning Dashboard

Located at `/settings/learning`:

```yaml
learning_dashboard:
  sections:
    - active_patterns: list of currently high-confidence patterns
    - proposals_today: patterns proposed in last 24 hours
    - proposal_history: all proposals ever made
    - archived_patterns: patterns no longer active
    - permission_evolution: how permissions have changed
    - learning_rate: visualization of pattern discovery over time
    - observation_audit: what's being observed and logged
```

### 11.2 Per-Pattern Controls

For each active pattern:

```yaml
pattern_controls:
  - view_details: see full pattern definition
  - view_history: see all confirmations and denials
  - export_pattern: export as procedure for sharing
  - mute: stop proposing this pattern (temporarily or permanently)
  - edit_triggers: user can refine when pattern should apply
  - elevation/demotion: user can manually change permission level
  - reset_confidence: user can "forget and start over" learning this pattern
```

### 11.3 Global Learning Controls

```yaml
global_controls:
  - pause_learning: OS stops observing and proposing (all new actions must be confirmed)
  - resume_learning: OS resumes
  - mute_proposals: pause suggestions (but continue learning internally)
  - learning_rate: slider to adjust how aggressive OS is with proposals
  - proposal_frequency: user can set max proposals per hour
  - observation_level: choose what dimensions get observed
  - forget_everything: nuclear option (clears all learned patterns)
```

### 11.4 Transparency and Auditability

All learning is auditable:

```
/activity/learned-patterns-applied
  - timestamp: when pattern was applied
  - pattern_id: which pattern
  - action: what action was taken
  - context: full context snapshot
  - user_response: did user keep the result or revert?

/settings/learning/observation-audit
  - what categories are being observed
  - sample of recent observations (non-sensitive)
  - what categories are NOT observed (explicit privacy list)
  - request to audit specific interactions
```

---

## 12. Edge Cases and Safety Considerations

### 12.1 Malicious Manipulation

**Risk:** User deliberately teaches OS incorrect patterns to observe what OS does.

**Mitigation:**
- OS maintains confidence scores; deliberate contradictions flag low confidence
- User can always override; OS watches overrides
- Learning is visible and auditable; user can see what OS learned
- Contradiction detection prevents bad patterns from becoming procedural

**No True Protection:** By design, if user deliberately teaches incorrect patterns, they succeed. This is acceptable—user owns their OS configuration.

### 12.2 Cascading Errors

**Risk:** Learned pattern triggers another pattern, creating unintended sequence.

**Mitigation:**
- Each learned pattern is independent; triggers are explicit
- If one pattern proposed action creates condition for second pattern, second pattern waits for confirmation
- User can always interrupt sequences manually
- Log shows full cascade (transparency)

**Safety:** Sequences happen only if user approves each step.

### 12.3 Permission Erosion

**Risk:** Over time, user approves so many actions that permission system becomes meaningless.

**Mitigation:**
- Approval rate must stay > 0.95 for autonomous elevation
- If approval rate drops, automatic demotion
- User can manually revert autonomy at any time
- High-consequence actions (delete, large changes) require higher thresholds
- User can set "critical actions always require confirmation"

### 12.4 Pattern Interference

**Risk:** Multiple learned patterns conflict in edge cases.

**Mitigation:**
- Conflict detection during pattern storage
- When conflicts detected: user chooses which pattern takes precedence
- Custom rules override learned patterns
- User can disable specific patterns in specific contexts

---

## 13. Implementation Checkpoints

### 13.1 MVP (Minimum Viable Learning)

To launch initial learning system:

```yaml
mvp_features:
  observation:
    - window positions and layouts
    - action sequences (5-10 steps)
    - confirmation patterns (approve/deny)

  pattern_detection:
    - sequence patterns (N-grams, 3-4 length)
    - decision patterns (simple context matching)

  proposals:
    - "I noticed you [action] every time [context]. Want me to do it?"
    - Single proposal type (simple suggestion)

  confirmation_flow:
    - User approves → confidence increases
    - User denies → pattern not deleted, confidence unchanged
    - No permission evolution (all supervised)

  storage:
    - Simple database of patterns with confidence scores
    - Episodic memory indexed by timestamp and action type

  controls:
    - `/settings/learning`: view active patterns
    - Mute pattern button
    - Clear all patterns button
```

### 13.2 Phase 2: Permission Evolution

```yaml
phase2_additions:
  - permission modes: supervised → autonomous
  - elevation criteria: calculate and apply
  - permission UI: show current permission level per action
  - custom rules: allow user-defined permissions
  - friction reduction: smart defaults, context awareness
```

### 13.3 Phase 3: Advanced Pattern Learning

```yaml
phase3_additions:
  - contradiction detection and flagging
  - cyclical/seasonal patterns
  - skill memory extraction
  - pattern decay and unlearning
  - advanced proposal types (decision match, efficiency opportunity)
```

---

## 14. Conclusion

The learning and adaptation system is the OS's long-term memory and improvement mechanism. By observing patterns, detecting them statistically, proposing them gently, and confirming them through user feedback, the OS learns how to be more helpful without requiring explicit programming or configuration.

Key design principles:
- **Observation without assumption**: OS watches, doesn't presume
- **Statistical confidence**: Patterns have confidence scores, not boolean flags
- **User agency**: Humans always decide; OS proposes and learns
- **Transparency**: All learning is visible and auditable
- **Permission evolution**: Friction decreases as trust builds
- **Graceful contradiction**: OS handles changes in behavior elegantly
- **Decay and forgetting**: Patterns fade naturally, matching human memory

The system serves the user's long-term autonomy: the better the OS learns the user's patterns, the less the user has to think about low-level decisions. Yet the user always controls what's learned, how it's applied, and can disable learning entirely if desired.

---

**Document 17 Complete**

Next: Document 18 - Multi-Agent Coordination and Delegation
