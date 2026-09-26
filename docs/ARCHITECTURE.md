# PORT Architecture

This document covers PORT's part of the Valance design: what it's responsible for, what it deliberately stays out of, and the rules that keep it that way. The sibling repos, [NEXUS](https://github.com/ValanceX/Nexus) and [MESH](https://github.com/ValanceX/Mesh), each have their own architecture doc. For the big picture, start at the [ValanceX organization page](https://github.com/ValanceX).

## The short version

> **Valance defines what an application means. PORT determines how that meaning is realized on a target.**

PORT is where Valance meets a real target. It takes the semantic output of MESH and **progressively lowers** it into whatever the target runs: DOM and CSS, native widgets, GPU commands, or something else entirely.

A good way to picture PORT is as a compiler backend, not a driver or an adapter. An adapter tries to preserve the source *interface*. A compiler backend preserves the source *meaning* and is free to change the implementation as much as the target rewards. Each PORT is expected to know both Valance semantics and its target deeply, and that is a feature, not a leak.

## What PORT is responsible for

PORT owns **target realization and optimization**. NEXUS and MESH establish what is correct; PORT establishes how to do it correctly and efficiently on one target.

```text
MESH semantic output
        │
        ▼
   PORT lowering
        │
        ▼
 PORT-specific IR(s)       ← as many stages as the target needs
        │
        ▼
target-specific lowering
        │
        ▼
  target runtime  →  host platform  →  hardware
```

Each PORT chooses its own internal pipeline. PORTs do not have to share a strategy:

```text
Web:     MESH → DOM representation → CSS representation → browser
Native:  MESH → native widget representation → platform API → native runtime
GPU:     MESH → render representation → GPU-oriented representation → graphics API
```

A PORT:

- receives MESH output that is already compiled, validated and renderer-independent;
- lowers it through whatever representations suit its target, **keeping semantic information (identity, interaction intent, accessibility role, update semantics) for as long as it helps decide something**. Information is discarded by lowering, never hidden early behind an opaque object;
- may specialize aggressively: target scheduling, memory behavior, native widget systems, compositing, event processing, caching, SIMD, hardware-specific paths. Any optimization is valid if it preserves the semantic guarantees established upstream;
- handles the lifecycle of what it realizes: mount, update, and unmount;
- **describes its own capabilities** (for example `stable-native-widget-identity`, `retained-rendering`, `gpu-compositing`). PORT is the authority on what its target can actually guarantee, so MESH never needs a global encyclopedia of platforms;
- realizes style semantics in the target's own styling system, and provides target-specific style concepts where they exist, always explicitly (e.g. under `@target linux`), never by pretending every target styles alike;
- should be **inspectable**: a developer should eventually be able to see what a PORT did with a given element (which target object it became, which optimizations applied) rather than treating it as an opaque engine;
- may offer **explicit escape hatches** down to target primitives and native APIs, clearly marked as leaving the portable layer.

## What PORT is not

- **Not a universal renderer interface.** There is no `createButton()` / `setLayout()` / `handleClick()` API that every target implements. That shape becomes a lowest-common-denominator compatibility prison. The only thing PORTs share is the semantic input they consume.
- **Not an adapter.** "Valance API → platform API" is the wrong mental model; "Valance semantics → target-specific compilation → target-native implementation" is the right one.
- **Not the owner of application semantics.** Improving a PORT should improve realization, not change what the application means.

## What PORT stays out of

- **No business logic.** Rules like "can this cart check out?" live in NEXUS.
- **No language knowledge.** PORT never sees MPRX source. It only ever receives output that MESH has already validated.
- **No application capability decisions.** Whether the app has haptics or a camera, and what to do without them, is resolved in NEXUS (see below).
- **No reaching upward.** PORT consumes semantic guarantees, not NEXUS or MESH internals, and it doesn't push target details back up into them.

## Two kinds of capability

Valance separates two questions that are easy to confuse:

| Question | Who answers |
|---|---|
| What can the **device** offer the application (camera, haptics, AI, storage)? And what's the fallback when it can't? | **NEXUS** resolves it once, into typed services, with an explicit strategy for anything unsupported. |
| What can this **target** guarantee when realizing UI (retained rendering, native window decoration, backdrop effects)? | **PORT** describes it, so MESH and tooling can reason about it. |

```text
Application → NEXUS → detect environment → resolve capability → application receives the result
PORT → describes target capabilities → MESH / tooling reason about them
```

Neither kind turns into scattered `if (device.hasX)` checks in feature or renderer code.

## Semantic contracts across the boundary

What crosses into PORT should describe **guarantees, not mechanisms**: "this element has stable identity", "these updates may be batched", "this value is immutable", never "MESH represents this as node type 17".

That lets NEXUS and MESH change their internals without breaking PORTs. The evolution rule, in both directions:

- Changing NEXUS or MESH: *did the semantic contract change, or only the implementation?* If only the implementation, PORT should be unaffected.
- Changing PORT: *did target realization improve, or did Valance semantics change?* A PORT should normally improve without changing application semantics.

New information in the semantic output should **improve realization, not become a requirement for correctness**. A PORT that ignores an optional hint must still be correct.

## Packages

| Package | Role |
|---|---|
| `@valence/port` | Shared boundary vocabulary: the semantic input a PORT consumes and the shape of a capability description. Not a renderer interface. |
| `@valence/port-web` | Web PORT (DOM + CSS): the first target |
| `@valence/port-canvas` | Placeholder. Deferred until the Web PORT raises a concrete question a second target would answer. |

PORTs depend on the shared vocabulary and never on each other, so adding a target never means touching an existing one.

## The first PORT is an experiment

We don't design every future PORT up front. The Web PORT is built seriously against a real target, and its job is to reveal which parts of Valance deserve to be stable semantics and which were accidentally target-specific. From there:

1. Define the smallest semantic contract NEXUS and MESH require.
2. Build one serious PORT against a real target.
3. Observe what is genuinely portable, and which assumptions were target-specific.
4. Refine the semantic boundary.
5. Add lower representations only where the target needs them.
6. Add a second target only when the first exposes a concrete architectural question.

Generalize from evidence, not speculation.

## The rules

These invariants keep PORT honest. If a change would break one of them, it probably belongs in another repo.

1. **PORT never owns application or business logic.**
2. **PORTs are replaceable.** Swapping one must not require changes to application logic.
3. **The input is renderer-independent.** The MESH output PORT consumes carries no target-specific assumptions, except for rules the application made explicitly target-specific.
4. **No leaks in either direction.** Target details don't leak into NEXUS or MESH, and PORT doesn't reach up into domain code or producer internals.
5. **Optimizations preserve semantics.** A PORT may specialize as far toward the hardware as it likes, as long as every guarantee established upstream still holds.
6. **Optional information is optional.** A PORT is correct without optimization hints; hints only make it better.
7. **Nothing is silently dropped.** Unsupported application capabilities have an explicit strategy, decided in NEXUS; unsupported target features are reported through the PORT's capability description, not quietly ignored.
8. **No universal renderer interface.** PORTs share semantic input, not an implementation API.
