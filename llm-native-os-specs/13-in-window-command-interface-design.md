# Document 13: In-Window Command Interface Design
## Elegant Command Entry for Leaf Agents Without Visual Repetition

**Status**: Core Design Specification
**Priority**: Critical UX Challenge
**Context**: How users command individual window agents when repeating a text bar in every window is "tedious and inelegant"

---

## The Problem Statement

From the design conversation:
> "We also find the best way to give commands in each window (I mean the design since repeating the text bar at the bottom might look tedious and inelegant)"

**The Challenge**:
- The conductor (main OS) receives commands through the primary text bar at the bottom
- Each window contains a leaf agent that needs to be independently commandable
- A naive solution (text bar in every window) violates the warm, calm design language and creates cognitive overhead
- Solution must work seamlessly with ambient voice mode
- Must feel natural, not feel like an extra interaction layer

---

## Design Option Analysis

### Option 1: Contextual Command Palette (CMD+K Style)
**How it works**: Focused window triggers an overlay showing action palette when user presses CMD+K (or similar).

**Strengths**:
- Fast, keyboard-driven
- Discoverable through standard shortcuts
- Doesn't add permanent UI clutter
- Clear visual separation of command mode

**Weaknesses**:
- Requires explicit invocation (modal state)
- Keyboard-centric, not voice-friendly
- Creates "mode" which some users find cognitive overhead
- Not ambient

**Voice Integration**: Poor—requires explicit trigger before voice works

---

### Option 2: Gesture-Based Invocation
**How it works**: Double-tap, long-press, or corner swipe on a focused window brings up minimal command interface.

**Strengths**:
- Touch-native and intuitive
- Minimal UI footprint when not invoked
- Works well on tablets/mobile OS forms

**Weaknesses**:
- Gesture-learning curve
- Conflicts with content interaction (selecting text, clicking)
- Not discoverable on first use
- Not ambient, requires deliberate gesture

**Voice Integration**: Still requires gesture trigger; voice doesn't help primary interaction

---

### Option 3: Inline Annotation (Content-Contextual)
**How it works**: User selects/highlights content within the window, then types or speaks a command about that content. "This paragraph → make it more concise."

**Strengths**:
- Highly contextual and natural
- Works beautifully with ambient voice mode ("make that more concise")
- No separate UI layer required
- Mirrors how humans naturally give feedback

**Weaknesses**:
- Only works when there's selectable content
- Not suitable for non-content windows (dashboards, controls)
- Requires content to be selectable
- Not all commands are content-directed

**Voice Integration**: Excellent—very natural voice experience

---

### Option 4: Ambient Voice Scoped to Focused Window (RECOMMENDED)
**How it works**: When a window is focused, voice commands automatically route to that leaf agent. No explicit invocation. User speaks naturally while looking at the window.

**Strengths**:
- Most elegant, most "ambient"
- Zero UI overhead
- Aligns with the design conversation's vision
- Works seamlessly with spatial reference map (everything on screen is referenceable)
- Completely invisible when not using voice
- User talks to what they're looking at—deeply natural

**Weaknesses**:
- Relies on ambient voice mode being enabled
- Could cause confusion if user talks and forgets which window is focused
- Needs clear visual focus indicator (but OS already has this)
- Non-voice users still need keyboard/other method

**Voice Integration**: Perfect—core interaction pattern

---

### Option 5: Focus-Aware Routing (Hybrid)
**How it works**: The main text bar at the bottom routes to whichever window is focused. Subtle focus indicator shows which agent is receiving input.

**Strengths**:
- One text bar, context-aware
- Keyboard-driven, accessible
- Works for all interaction styles (keyboard, voice)
- Minimal visual complexity
- Consistent with main OS interface

**Weaknesses**:
- Text bar at bottom may be far from the focused window (cognitive distance)
- Requires window focus to be obvious
- Discoverability: users may not realize the bottom bar routes to focused window
- Interrupts flow for rapid multi-window interactions

**Voice Integration**: Good—can route voice to focused window automatically

---

### Option 6: Hover/Proximity Mini-Bar
**How it works**: A minimal, semi-transparent command line appears near cursor when hovering over a window. Disappears when not needed.

**Strengths**:
- Always available, never intrusive when not hovering
- Minimal visual footprint
- Appears contextually near content

**Weaknesses**:
- Mouse-centric, not friendly to keyboard or voice
- Creates visual "busy-ness" when hovering
- Proximity-based UI can feel finicky
- Not accessible for non-mouse users

**Voice Integration**: Poor—requires mouse hover; not voice-native

---

## Recommended Solution: Layered Approach

### Primary: Ambient Voice + Focus-Aware Routing
**The foundation**:
- Ambient voice mode is enabled by default
- User simply speaks commands while looking at a focused window
- Voice naturally routes to the focused leaf agent
- No explicit invocation, no UI, completely ambient

### Fallback 1: Enhanced Context-Aware Text Input
When keyboard is being used:
- User can type directly without a separate command bar
- Focus indicator makes it clear which agent is receiving input
- Can start with special character (`:` or `>`) to enter command mode, or just speak natural language
- Keyboard shortcuts available for rapid experts (e.g., `Cmd+` for specific actions)

### Fallback 2: Contextual Inline Commands
For content-heavy windows:
- Inline annotation: select content, speak or type command about it
- "Summarize this section"
- "Make this more concise"
- Works seamlessly alongside voice mode

### Fallback 3: Universal Command Palette (Escape Hatch)
For discoverability and complex commands:
- `Cmd+Shift+K` opens "Actions for [Window Name]" palette
- Shows all available actions for the focused leaf agent
- Keyboard-navigable with descriptions
- Essential for new users to discover what their window agent can do

---

## Visual & Interaction Design

### Focus Indicator (Already Exists in OS)
The window focus is already visually indicated in the OS. This serves double duty:
- Shows which window agent is active
- Tells user where their voice commands will route
- Uses existing visual language (warm, calm border treatment)

**Enhancement**: When voice is active/listening:
- Subtle pulse or glow on focused window border
- Microphone icon appears briefly in window header
- Calming, not aggressive

### Voice Mode Visual Feedback
- Small, persistent indicator showing voice mode is active (e.g., in OS toolbar)
- When a window is focused with voice active: border accent becomes "listening" state
- When voice command is processed: brief confirmation (not obtrusive)

### Keyboard Interaction Model

```
User is focused on Window A (Agent A)

Direct Command (Voice):
  → "Make this more detailed"
  → Routes to Agent A, acts on A's current context

Keyboard Command (Text):
  → Start typing: natural language or structured command
  → System interprets and routes to Agent A
  → Example: "reorganize by priority" → Agent A processes

Explicit Command Palette:
  → Cmd+Shift+K while Window A is focused
  → Shows actions available for Agent A
  → Select with arrow keys + Enter or mouse

Multi-Window Flow:
  → User clicks Window B
  → Focus shifts to Agent B
  → Voice commands now route to Agent B
  → Text bar routes to Agent B
  → No reorientation needed
```

### Accessibility Considerations

**Keyboard-Only Users**:
- Can use `Tab` to cycle through windows, establishing focus
- `Cmd+Shift+K` to open action palette
- All actions discoverable and keyboard-navigable
- No reliance on voice or mouse

**Voice-Only Users**:
- "Focus on [Window Name]" command to switch focus
- "Show actions" to open palette for current window
- Full voice command set for all actions

**Screen Reader**:
- Window focus changes announced
- Command palette is fully screen-reader accessible
- Focus indicator semantically marked

---

## Connection to Action Space

Each leaf agent has a defined action space:
- **Agent A** (Research window): summarize, extract, organize, refine, cite
- **Agent B** (Writing window): expand, condense, rephrase, check-tone, outline
- **Agent C** (Analysis window): compare, correlate, extract-patterns, explain

### How It Works

1. **Window is focused** → User sees which agent is active
2. **User gives command** (voice, text, or palette):
   - Voice: "Make this argument stronger" → routes to focused agent's action space
   - Text: "stronger argument" → parsed, routed to focused agent
   - Palette: Shows available actions for focused agent
3. **Agent processes** using its specific action space and window context
4. **Result displays** in that window, no context switch needed

---

## Implementation Specification

### Core Components

#### 1. Focus Manager (Already Exists, Enhanced)
```
FocusManager {
  activeWindowAgent: LeafAgent

  onWindowFocus(windowId) {
    this.activeWindowAgent = getAgentForWindow(windowId)
    updateVoiceRouting(this.activeWindowAgent)
    updateTextBarHint(this.activeWindowAgent)
    updateVisualIndicator(windowId)
  }

  getRouteTarget() {
    // Text bar and voice both use this
    return this.activeWindowAgent
  }
}
```

#### 2. Voice Command Router (New)
```
VoiceCommandRouter {
  isListening: boolean
  focusedAgent: LeafAgent

  onVoiceInput(transcript) {
    if (!this.isListening) return

    // Route to focused agent
    command = parseVoiceInput(transcript)
    result = await focusedAgent.executeAction(command)

    // Provide subtle feedback
    showConfirmation(result.status)
  }

  setFocusedAgent(agent: LeafAgent) {
    this.focusedAgent = agent
    updateVoiceIndicator()
  }
}
```

#### 3. Window Command Palette (New)
```
WindowCommandPalette {
  agent: LeafAgent

  constructor(agent) {
    this.agent = agent
    this.actions = agent.getAvailableActions()
  }

  render() {
    return {
      title: `Actions for ${this.agent.name}`,
      items: this.actions.map(action => ({
        title: action.title,
        description: action.description,
        keyBinding: action.keyBinding,
        invoke: () => this.agent.executeAction(action)
      }))
    }
  }

  open() {
    // Cmd+Shift+K or programmatic
    showOverlay(this.render())
  }
}
```

#### 4. Inline Command System (New, Optional Enhancement)
```
InlineCommand {
  selectedContent: string
  windowAgent: LeafAgent

  activate(selection, agent) {
    this.selectedContent = selection
    this.windowAgent = agent
    showInlineCommandInput()
  }

  parseAndExecute(commandText) {
    context = {
      content: this.selectedContent,
      window: this.windowAgent.context
    }
    return this.windowAgent.executeActionWithContext(commandText, context)
  }
}
```

#### 5. Visual Indicators (New)
```
FocusIndicator {
  element: WindowElement

  show(windowElement, isVoiceActive: boolean) {
    element.classList.add('focused')
    if (isVoiceActive) {
      element.classList.add('voice-listening')
      element.showMicIcon()
    }
  }

  updatePulse(isProcessing: boolean) {
    if (isProcessing) {
      element.classList.add('processing')
    } else {
      element.classList.remove('processing')
    }
  }
}
```

### Data Flow Diagram

```
User Input
  ├─ Voice (Ambient)
  │  └─ VoiceCommandRouter
  │     └─ routes to activeWindowAgent
  │        └─ executes in agent's action space
  │           └─ result displays in window
  │
  ├─ Text (Main Bar)
  │  └─ FocusManager.getRouteTarget()
  │     └─ sends to activeWindowAgent
  │        └─ executes in agent's action space
  │           └─ result displays in window
  │
  └─ Palette (Cmd+Shift+K)
     └─ WindowCommandPalette
        └─ shows actions for activeWindowAgent
           └─ user selects action
              └─ executes in agent's action space
                 └─ result displays in window
```

### Keyboard Shortcuts

| Action | Shortcut | Context |
|--------|----------|---------|
| Show Actions Palette | `Cmd+Shift+K` | Any window |
| Focus Next Window | `Cmd+\`` | Any window |
| Focus Previous Window | `Cmd+Shift+\`` | Any window |
| Direct to Main OS | (speak naturally / click main area) | Default |
| Switch Voice Mode | `Cmd+Shift+V` | Toggle on/off |
| Inline Command Mode | `Cmd+E` | When content selected |

---

## Voice Integration (Detailed)

### Ambient Voice Flow

```
User is focused on Research Window (Agent: Research)
Ambient voice is active (global OS feature)

User speaks: "Summarize the key findings from this document"

Flow:
1. OS Voice Engine captures audio
2. Voice Router checks: which window has focus?
   → Research Window is focused → Agent: Research
3. Command parsed: "summarize key findings"
4. Agent: Research checks its action space
   → "summarize" action exists ✓
   → "key findings" maps to current window context ✓
5. Execute: agent.summarize(context: currentDocument)
6. Result: New summary appears in window
7. Subtle confirmation: border glow briefly, or text appears with "Summary generated"

User refines with voice: "Make it more concise"
→ Routes to Research Agent (still focused)
→ Executes: agent.condense(previousSummary)
→ Result: Condensed summary displayed
```

### Voice Mode Activation & Feedback

- **Default State**: Voice mode is on, but inactive unless user speaks or taps microphone
- **Listening Indicator**: When window is focused and listening, focused border shows subtle "listening" accent
- **Parsing Feedback**: As speech is recognized, interim text appears (optional, configurable)
- **Execution Feedback**: When command is understood and executing, brief confirmation (not blocking)
- **Error Feedback**: If command isn't recognized, warm prompt: "I didn't understand. Try [related actions]" with actual options listed

---

## Design Language Integration

### Warm & Calm Aesthetic

- **No aggressive overlays** for command entry
- **No modal dialogs** blocking the user's view of content
- **Soft, transparent indicators** for voice/focus state
- **Gentle animations** (pulse, fade) rather than harsh transitions
- **Color palette**: Use existing OS calm colors for all indicators
- **Microphone icon**: Integrated subtly into window header, not standalone badge

### Visual Hierarchy

1. **Content** (primary): User's work in the window
2. **Focus indicator** (subtle): Border treatment showing window is active
3. **Voice indicator** (when listening): Gentle accent on focus indicator
4. **Action palette** (on demand): Opens as clean overlay when requested
5. **Confirmation** (transient): Brief feedback, disappears quickly

---

## Fallback & Accessibility Matrix

| User Profile | Primary Method | Fallback 1 | Fallback 2 | Fallback 3 |
|--------------|----------------|-----------|-----------|-----------|
| Voice-first | Ambient voice to focused window | Command palette | N/A | N/A |
| Keyboard-first | Text input to focused window | Command palette (Cmd+Shift+K) | Tab to focus, type | Focus routing |
| Mouse-first | Click window, click action buttons | Command palette | Inline context menu | Voice commands |
| Accessibility | Full keyboard nav | Screen reader | Voice mode | All above |
| New user | Command palette shows options | Tooltips on actions | Voice hints | Tutorial mode |

---

## Error Handling & Disambiguation

### When Command Routing is Ambiguous

```
User is in Code Window (Agent: Code Assistant)
Speaks: "Save this"

Ambiguity check:
- Does Code Agent have "save" action? → Yes
- Should it save window content or specific selection? → Ask with voice

Response: "Save the entire file or the selected function?"
User: "The function"
→ Execute: agent.saveSelection()
```

### When Command is Outside Agent's Action Space

```
User is in Research Window (Agent: Research)
Speaks: "Write me a poem"

Check: Does Research Agent have "write poem" action? → No
Does it have similar action? → "compose", "generate", "create"

Response: "I can generate a document summarizing key points. Would that help?"
Or: "That's outside my current abilities. Switch to the Writing agent?"
```

---

## Implementation Priorities

### Phase 1 (MVP): Ambient Voice + Focus Routing
- Implement FocusManager enhancement
- Implement VoiceCommandRouter
- Add subtle visual focus indicators
- Test with representative user flows

### Phase 2: Keyboard & Discovery
- Implement WindowCommandPalette (Cmd+Shift+K)
- Full keyboard shortcut set
- Accessibility audit and fixes
- Screen reader support

### Phase 3: Advanced Features
- Inline annotation system
- Multi-select commands
- Command chaining/macros
- Context memory (remember recent commands per window)

### Phase 4: Polish
- Visual refinements
- Performance optimization
- Error message refinement
- Tutorial/onboarding integration

---

## Recommendations Summary

### ✓ Primary Recommendation: Ambient Voice + Focus-Aware Routing

**Why this approach**:

1. **Elegance**: Zero UI clutter. User speaks while looking at window. Invisible when not needed.
2. **Alignment**: Directly addresses the design conversation concern—no tedious repeated text bars
3. **Speed**: Fastest possible interaction for ambient voice users
4. **Naturalness**: Mirrors how humans naturally communicate ("do this" while pointing at something)
5. **Warmth**: Fits the calm, ambient design language perfectly

**Key insight from design conversation**:
> "Everything on screen is inherently referenceable (spatial reference map)"

This maps perfectly to voice scoped to focused window. When voice routes to the focused agent, the user can reference anything in that window naturally, and the agent understands the context.

### ✓ Critical Companion: Command Palette for Discovery

**Why necessary**:
- Users need to discover what actions are available
- New users need guidance
- Keyboard-only accessibility
- Acts as safety net for voice users

**Key insight**:
Cmd+Shift+K showing "Actions for [Window Name]" with descriptions is the most elegant fallback. It's not a burden; it's a reference tool.

### ✓ Optional Enhancement: Inline Annotation

**When to use**:
- Research/writing windows where users select content frequently
- "Make this section clearer" while text is highlighted is natural voice
- Doesn't add overhead, purely additive

---

## Success Metrics

- **Discoverability**: New users find command options within 2 minutes
- **Voice User Satisfaction**: Voice users never use command palette (content is in action space)
- **Keyboard User Efficiency**: Expert keyboard users can execute 90% of commands without opening palette
- **Visual Cleanliness**: No "UI fatigue"—users report feeling calm while using system
- **Accessibility**: 100% keyboard-navigable, full screen reader support
- **Ambient Feel**: Voice users report feeling like they're talking to the window, not the OS

---

## Conclusion

The recommended solution respects the original design vision by **eliminating tedious repetition** through intelligent routing and ambient voice integration. A focused window + voice command creates the most elegant, least cluttered interface.

The command palette serves as the discoverable fallback, not the primary interface. This inversion (voice primary, palette fallback) is the key to elegance—most expert users never see the palette, while new users can find it instantly.

The design feels warm, calm, and invisible when working smoothly—exactly the ambient computing ideal the OS is striving for.
