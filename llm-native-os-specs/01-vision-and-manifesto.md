# LLM-Native Operating System: Vision & Manifesto

## The Problem with Translation Layers

For the past two years, we have been building elaborate *shims*. Claude Code. Open Interpreter. Apple Intelligence. Copilot for Windows. Each of these systems takes the same approach: an LLM generates text that looks like code or instructions, and a translation layer converts it back into primitives designed for humans clicking buttons with mice.

This is a fundamental architectural compromise.

The LLM generates intent in a human-readable form. The system translates it into machine execution. The results come back as streams of output. The LLM reads the output as text. It decides what to do next. It generates more text. Another cycle of translation begins.

Every translation is a tax on speed, on expressiveness, and on trust. The LLM cannot reason directly about system state. It cannot orchestrate work with true parallelism. It cannot co-evolve with learned patterns. Most critically: it cannot control the system *as itself*, in the primitives that the system actually understands.

We have built adaptation layers for the LLM to fit into a human interface paradigm. We should have burned down the human interface paradigm and rebuilt it around what the LLM actually is.

## The Core Thesis

An operating system should be designed for the intelligence that actually runs it.

If the intelligence layer is an LLM, then every primitive, every interface, every action dispatch mechanism, every memory architecture, and every agent orchestration pattern should be optimized for LLM reasoning and control—not for humans with mice.

This does not mean removing human agency. It means radically reconceiving what human agency looks like in a world where continuous machine intelligence is the default control layer. The human becomes a supervisor, a steering force, a teacher, an observer. The interface becomes a *workspace* where the human watches intelligence work and reaches in to redirect it when necessary.

This is the first operating system built for this reality.

## What This Is

**An LLM-native OS is defined by:**

1. **No translation layer**: The LLM does not generate text that something else parses. The OS speaks the LLM's language natively: structured JSON action schemas, state deltas, capability manifests, and agent hierarchies.

2. **Native action dispatch**: Every operation—file I/O, UI creation, network requests, task orchestration, memory access—registers as a callable action with a schema. The LLM emits structured intents directly to the action dispatcher. The dispatcher validates against schema, executes, and returns structured state. No text parsing. No regex fragility. No hallucination-prone code generation.

3. **Self-extending capability space**: The action space is not closed. The LLM can register new actions at runtime. Three-tier hierarchy: immutable core OS actions (filesystem, process, memory), app-registered actions (persistent, discoverable), and LLM-created actions (ephemeral, promotable to persistent). The OS grows as the LLM's capabilities evolve.

4. **Live capability awareness**: The LLM doesn't pull capability information from documentation. The OS pushes a live, auto-updating manifest of what it can do. This manifest is part of working memory—kept small, kept current, kept in context. The LLM always knows exactly what it can do right now, and what changed since the last turn.

5. **Agent-centric architecture**: A single LLM at the top (Conductor) controls workspace orchestrators, which supervise leaf agents in individual windows. This is not a flat message-passing system. This is a hierarchy with clear escalation paths, shared scratchpad access, and the ability to run different models at different levels. Multi-agent orchestration is a primitive, not a workaround.

6. **Four-layer memory system**:
   - **Episodic**: Timeline of events, actions, outcomes—queryable history.
   - **Semantic**: Knowledge graph of entities, relationships, learned facts—persistent reasoning substrate.
   - **Procedural**: Workflows, patterns, skills learned from observation and repetition.
   - **Working**: Fast, small, structured store of what's relevant *right now*—the OS intelligently manages what lands in the LLM's context window.

7. **Spatial, task-oriented UI**: No floating windows. No menus six layers deep. Tasks are first-class objects—they can be minimized, resized, magnetically attached to other tasks like cards on a desk. A pull-out task graph on the right shows the DAG of everything in flight. The interface is a *workspace*, not an application launcher.

## What This Is Not

- **Not a shim over Linux or Windows**: We are not wrapping an LLM around a human-designed OS and pretending it is intelligent.
- **Not Claude Code or Open Interpreter**: Those systems translate LLM output into system calls. This system makes the LLM's output *the system calls*.
- **Not multi-agent in the sense of distributed autonomous teams**: This is hierarchical, orchestrated, and human-steerable at every level.
- **Not minimal or constrained**: Dynamic UI generation, spatial references, voice as a first-class interaction mode, reasoning-as-a-visible-primitive, branching undo, permission learning—this is feature-rich in the ways that matter for LLM control.
- **Not a chatbot interface with bells on**: The chat is the command line of this system, but the interface is a full workspace with live task graphs, dynamic composition, and stateful interaction.

## The Experience Vision

### The Desk, Not the Cockpit

When you sit down to use this system, it should feel like a well-worn wooden desk. Not a spaceship cockpit. Not a minimalist dashboard. A desk where intelligence is working on your behalf, and you can see it, talk to it, redirect it, watch it learn.

The workspace is visible. Every task is a window. Windows can be minimized, resized, grouped, or magnetically attached to others. A live task graph on the right shows you everything in flight—not as a flat list, but as a directed acyclic graph of dependencies and parallelism. You can see at a glance what is blocked, what is in progress, what is waiting on what.

### The Interface

- **Bottom text bar**: Your primary command channel. Type to the system. The LLM reads it as context and intent.
- **Slide right for voice**: Voice is not a secondary feature. Slide from the left edge to activate ambient voice mode. The system listens to natural conversation, parses commands and context, and acts on intent without requiring explicit invocation. When the system needs to clarify, it speaks back.
- **Spatial reference**: Everything on screen is inherently referenceable. Point at a window. Say "show me the distribution in that chart." Point at text. Say "summarize that." The system maintains a spatial reference map. You are not searching for UI elements. You are talking about what you see.
- **Task windows as primitives**: Every task—a code edit, a research inquiry, a long-running computation, a conversation—is a window. Windows are not modal. Bring another to the front. Switch contexts. Minimize one. The right-side task graph tells you everything that is in flight and how they relate.
- **Color is warm and earned**: Backgrounds are warm sand, clay, and earth tones. Accents are amber and gold for active elements, muted teal for system-level information. Color is sparse and intentional. When something is highlighted, it is highlighted for a reason.

### The Agency Model

You are not commanding. You are steering.

When you give the system a task, it breaks it down, plans in the working memory, and shows you the reasoning. You watch the reasoning evolve. You see the system decompose the problem. You can agree, disagree, suggest a different approach, or take over a subtask yourself.

The system learns your patterns. It learns what you care about, how you prefer information presented, which kinds of decisions you want to be asked about and which you want it to make autonomously. The permission system has three modes: supervised (ask before every significant action), autonomous (act and report), and custom (learn over time which category each action type falls into).

You are not reading logs and waiting for completion. You are watching intelligence unfold.

## The Technical Philosophy

### Structured Action Dispatch (No Text Generation)

At the core of this system is the principle that **the LLM should not generate text that looks like code**. It should generate structured JSON intents that the system validates and executes directly.

Every operation is a callable action with a schema:

```
{
  "action": "create_window",
  "params": {
    "type": "text_editor",
    "content": "...",
    "position": [x, y],
    "size": [width, height]
  }
}
```

The OS validates `params` against the schema for `create_window`. If valid, it executes atomically. If invalid, it rejects with structured error. The LLM receives structured state back, not a log message. The LLM does not parse. The LLM does not hallucinate. The LLM does not generate code that might or might not work.

This extends to everything: file operations, task creation, agent escalation, memory queries, UI composition. Every operation has a schema. Schemas are discoverable. The system guarantees that valid intents will execute successfully.

### Three-Tier Action Hierarchy

- **Core OS actions** (immutable): Filesystem, process management, memory, rendering, compositor, audio. These are the primitives. They do not change.
- **App-registered actions** (persistent): Applications register callable actions when they load. A text editor registers "insert_text", "delete_region", "apply_syntax_theme". These are discoverable and persistent across sessions.
- **LLM-created actions** (ephemeral, promotable): The LLM can create new actions at runtime. A temporary scratchpad action. A custom formatter. A one-off data pipeline. These are ephemeral by default but can be promoted to persistent if they prove useful.

This is how the action space grows. The LLM is not constrained by what was designed before it. It can extend the system's capabilities in real time.

### Live Capability Manifest

The LLM does not query documentation. The OS pushes a capability manifest to working memory—a live, auto-updating list of what the system can do right now, what parameters each action requires, what state is available, what constraints apply.

This manifest is small. It contains only what is relevant. The OS intelligently prunes deprecated actions, groups related actions, highlights frequently-used capabilities. The manifest updates whenever the system changes: new app loaded, new action registered, new data available.

The LLM always knows what it can do. There is no hallucination about capability. There is no outdated documentation. There is no "I'm not sure if that action exists anymore."

### Agent Hierarchy with Escalation

A single Conductor agent (the main LLM chat) controls Workspace Orchestrators. Each open workspace has its own orchestrator agent. Each window in the workspace has leaf agents that perform specific tasks.

Communication flows upward explicitly. A leaf agent does not broadcast to peers. It escalates to its orchestrator. The orchestrator coordinates. If something requires top-level decision, it escalates to the Conductor.

This is not a flat peer-to-peer system. This is a clear hierarchy with clear responsibilities. The Conductor does not micromanage. The orchestrators do not micromanage. But every agent knows who is in charge and can ask for help.

Different models can run at different levels. A small, fast model for leaf agents. A larger model for orchestrators. GPT-4 or Claude 3.5 for the Conductor. The system is model-agnostic.

### Four-Layer Memory Architecture

**Episodic Memory**: A queryable timeline. Every action, every outcome, every decision is logged with timestamp, context, and result. "Show me all the times I edited CSS in this project." "What was the user doing three sessions ago when they switched to the design workspace?" This is high-volume, immutable, indexed.

**Semantic Memory**: A knowledge graph. Entities: files, projects, people, concepts, patterns. Relationships: "depends on", "relates to", "authored by". The LLM can query this graph. It can reason about relationships. It can identify patterns across time.

**Procedural Memory**: Learned workflows. "When the user opens a design file, they usually also open a code editor and a browser to a specific URL." "This user prefers YAML over JSON." "These three actions are always done together." The system learns these patterns and can suggest them.

**Working Memory**: The small, fast, structured store of what matters right now. What is the current task? What is the state of the most recent computation? What did the user say? What actions are available? The OS manages what lands in the LLM's context window. It is small enough to fit in context. It is always current. It is the interface between the LLM and the system state.

### Dynamic, Composable UI Primitives

The LLM does not write HTML or React components. It composes from high-level primitives: `DataTable`, `InteractiveMap`, `Timeline`, `Canvas`, `CodeEditor`, `Chat`, `Form`. Each primitive is optimized for its use case. Each understands events, state changes, and rendering.

When the LLM needs to visualize data, it does not generate code. It emits:

```json
{
  "action": "create_widget",
  "widget_type": "DataTable",
  "data": [...],
  "columns": [...],
  "on_row_click": "select_record"
}
```

The OS renders it natively. The user interacts with it. The LLM receives structured events: `row_selected`, `column_sorted`, `cell_edited`. No parsing. No fragility.

### Spatial Reference and Implicit Context

Everything on screen is referenceable by spatial location. The OS maintains a spatial map. When the user points at a window and says "summarize that", the system knows exactly which window and what content is visible in it. The LLM receives: `{"action": "summarize", "target": "window_id_2", "visible_content": {...}}`.

This eliminates the need for the user to explicitly name or reference things. They talk about what they see. The system understands spatial context implicitly.

### Permission System with Learning

Three modes:
- **Supervised**: Ask before every significant action (file deletion, network requests, API calls).
- **Autonomous**: Act and report. The system makes decisions on its own.
- **Custom**: Learn. The system observes over time which actions the user wants to be asked about and which they prefer autonomous execution.

The learning is probabilistic and explicit. The system tracks decisions. It builds a user model. It suggests permission modes. "You've approved this action type 50 times without modification. Should I make it autonomous?" The user retains full control.

### Version Control Everything

Not just code. Everything. Every edit to every document, every configuration change, every decision, every workspace state. The system tracks all of it in a branching version history (like git, not like linear undo).

The user can inspect the history. They can branch at any point. They can return to a previous state. They can compare versions. They can see what changed and why.

For code, this is obvious. For documents, designs, data—it becomes a powerful tool for exploration and recovery.

## Why Now

Large language models are no longer adding intelligence to existing systems. They *are* the control layer. The question is no longer "how do we help humans use computers?" It is "how do we help humans steer machine intelligence?"

The answer is not to build a better chatbot. It is to rebuild the operating system around the reality of machine intelligence as the default control layer.

This is that OS.

## What Happens Next

This document is the seed. The remaining 25 documents define the specifics: action schemas, memory architecture, agent protocols, UI component library, permissions model, voice parsing, temporal reasoning, multi-user semantics, and the implementation roadmap.

Every engineer reading this should understand: we are not optimizing for human-centric paradigms. We are optimizing for LLM reasoning, control, scalability, and transparency. When those conflict with traditional OS design, LLM-native design wins.

The system should feel natural to the human user because it is profoundly aligned with how the LLM actually works. Speed, clarity, agency, learning, and trust emerge naturally from that alignment.

This is the design principle: **optimize for the intelligence that will run you**. Build the OS around the LLM, not the LLM into the OS.
