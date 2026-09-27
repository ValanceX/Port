# PORT V1 Roadmap

## Purpose

PORT is the Valance target-realization layer.

> **Valance defines what an application means. PORT determines how that meaning is realized on a target.**

PORT consumes renderer-independent semantic guarantees produced by MESH/NEXUS and lowers them into target-native representations.

The first serious target is **Web**.

The goal of PORT V1 is not to design a universal rendering abstraction. It is to prove that the Valance semantic model can become a real, deployable Web application:

```text
MPRX
  ↓
MESH compiler → template-v1 → MESH runtime
  ↓
render-v1
  ↓
NEXUS application runtime (Mesh.host), via a composer
  ↓
PORT Web
  ├── Server → HTML
  └── Browser → DOM + CSS + Events
                    ↓
                 Hydration
                    ↓
              Interactive SPA
```

The roadmap deliberately generalizes from evidence gathered from the Web implementation rather than speculative abstractions for native, Canvas, GPU, or other targets.

---

# 1. Architectural Position

PORT sits downstream of MESH and NEXUS.

```text
┌───────────────┐
│     MESH      │
│               │
│ MPRX → Semantics
└───────┬───────┘
        │
        ▼
┌───────────────┐
│     NEXUS     │
│               │
│ Application   │
│ semantics     │
│ state         │
│ commands      │
└───────┬───────┘
        │
        ▼
┌────────────────────┐
│        PORT        │
│                    │
│ Target realization│
└─────────┬──────────┘
          │
          ▼
     Target platform
```

PORT does **not** redefine application semantics.

It answers:

> Given these already-defined semantics, how can this target realize them correctly?

---

# 2. PORT Invariants

These invariants govern all PORT development.

### 2.1 PORT never owns application logic

PORT does not decide:

* business rules
* application state meaning
* command semantics
* domain behavior
* fallback policy
* application-level authorization
* application workflows

Those belong upstream.

---

### 2.2 PORTs are replaceable

A Valance application should not need to fundamentally change its semantics because the target changes.

Different PORTs may realize the same semantic input differently.

---

### 2.3 PORT input is renderer-independent

PORT must not require:

* DOM nodes
* browser events
* CSS objects
* Canvas objects
* native widgets
* GPU resources

as its semantic input.

Those are target realization details.

---

### 2.4 No semantic leakage

Target details must not leak upstream.

For example:

```text
MESH
  ✗ HTMLElement
  ✗ CSSStyleDeclaration
  ✗ PointerEvent
  ✗ DOM-specific lifecycle

NEXUS
  ✗ document
  ✗ window
  ✗ browser event objects
  ✗ Web-specific rendering APIs
```

Likewise, PORT must not reach into application internals to recover semantics that should have been supplied by MESH/NEXUS.

---

### 2.5 Optimizations must preserve semantics

PORT may optimize:

* scheduling
* DOM reuse
* event delegation
* batching
* caching
* target-specific memory usage
* native platform facilities

provided that the observable application semantics remain unchanged.

---

### 2.6 Optional information remains optional

A PORT may receive hints that improve realization.

Those hints must not silently become correctness requirements unless the semantic contract explicitly promotes them to guarantees.

---

### 2.7 Nothing is silently dropped

If the target cannot realize something, the system must make that fact explicit.

There are two different cases:

```text
Application capability unavailable
        ↓
NEXUS handles capability/fallback semantics

Target realization limitation
        ↓
PORT describes or reports the limitation
```

PORT must not silently discard application semantics.

---

### 2.8 No universal renderer interface

PORTs should share a **semantic boundary**, not a forced implementation API.

Do not prematurely create:

```ts
interface UniversalRenderer {
  createElement(...)
  appendChild(...)
  setStyle(...)
  ...
}
```

if doing so merely hides differences between targets.

Each PORT is allowed to have its own internal pipeline.

---

### 2.9 Preserve information until lowering

PORT should preserve useful semantic information for as long as it can contribute to correct realization.

Examples:

* identity
* interaction intent
* accessibility semantics
* update semantics
* child ordering
* state relationships

Information should only be discarded through explicit lowering.

---

### 2.10 PORT should eventually be inspectable

A developer should eventually be able to understand:

```text
Valance element
    ↓
PORT realization
    ↓
Target object
```

and, where applicable:

```text
Applied optimizations
Target capability decisions
Lowering decisions
```

This is important for debugging and developer tooling.

---

# 3. Roadmap

## Phase 0 — Scaffold and Boundary Freeze

**Status:** Done (2026-09-27). See the [integration audit](./architecture/2026-09-27-port-integration-audit.md).

### Goals

Establish the repository and package boundaries without prematurely designing a renderer abstraction.

### Work

* workspace/build/test infrastructure
* shared PORT package
* Web PORT package
* deferred Canvas package
* package dependency boundaries
* architecture documentation
* PORT invariants
* initial test infrastructure

### Package direction

Settled by the audit (Gates 3 and 4): the namespace is `@valancex`, matching MESH and NEXUS. The only package is `@valancex/port-web`. A shared `@valancex/port` isn't created, because the shared contract is language-neutral data and prose ([CONTRACT.md](./CONTRACT.md)), and the Canvas placeholder was removed. Either may return when a second target produces evidence for it.

### Explicitly deferred

Do not implement:

* universal renderer APIs
* native renderer abstractions
* Canvas renderer
* GPU abstraction
* widget abstraction
* cross-platform styling API

### Exit criteria

The scaffold is stable and establishes a boundary without pretending to know the final rendering architecture.

---

# V0.1 — Semantic Input Boundary

**Status:** Done. The input is MESH's render-v1, unchanged, and the protocol is [CONTRACT.md](./CONTRACT.md): *draw*, *update*, *unmount* in; `(handler, payload)` out. Of the candidates below, render-v1 carries identity (keys), hierarchy, child ordering, text, props (final values) and interaction intent (handler identifiers). It carries no styles, accessibility semantics or lifecycle expectations; those are open questions for MESH (audit U1, U2).

## Objective

Define the smallest renderer-independent semantic input that PORT must consume.

The contract should describe **what needs to be realized**, not how it should be rendered.

### Candidate semantics

The boundary should be evaluated against:

* element identity
* hierarchy
* text/content
* attributes
* properties
* styles
* event/interaction intent
* accessibility semantics
* child ordering
* update semantics
* application-owned values
* lifecycle expectations

This list is a starting point, not an assumption that every item belongs in the final contract.

### Important constraint

Do not simply expose the MESH IR wholesale.

PORT should consume the semantic guarantees it actually needs.

*Resolved:* MESH has no public IR. render-v1 is already the minimal, guarantee-shaped output MESH designed for renderers, so PORT consumes it as is (audit C8).

### Tests

Create contract fixtures that allow a fake/test producer to feed PORT without importing MESH internals.

### Exit criteria

A producer can exercise PORT using the semantic boundary without depending on MESH implementation details.

---

# V0.2 — Web Realization Core

**Status:** Done for what render-v1 carries: elements, identity, text, attributes, boolean attributes, hierarchy, ordering, draw, update, unmount (`@valancex/port-web`). Not done: DOM properties and styles, which nothing yet requires. Number, list, record and `null` values have no given text, so an attribute realization refuses them (audit U3).

## Objective

Turn the semantic boundary into real Web output.

Initial pipeline:

```text
PORT semantic input
        ↓
Web lowering
        ↓
DOM
```

### Implement

* element creation
* element identity
* text
* attributes
* properties
* hierarchy
* deterministic child ordering
* basic styles
* mount
* update
* unmount

### Principle

Prioritize correctness over optimization.

Do not prematurely optimize the Web realization pipeline.

### Exit criteria

A semantic fixture can produce a correct DOM tree.

---

# V0.3 — Events and Interaction

**Status:** Mechanism built, **semantics incomplete**. A realization maps each event to a DOM event type and builds its payload; listeners read the drawn tree's handler identifier when they fire, and are removed with their node. The vertical slice runs DOM click → `users.select` in NEXUS. Delegation isn't used: nothing yet justifies it.

**Blocked on MESH:** propagation. MESH doesn't define whether one interaction can trigger more than one binding (nested bound nodes, or two events of one node), nor which interactions a primitive's event covers. The Web PORT currently bubbles, as the DOM does. That is characterized by tests, not contractual. See the [event propagation audit](./architecture/2026-09-27-event-propagation-audit.md). V0.3 isn't complete until MESH decides.

## Objective

Connect Web interactions back to semantic application intent.

Pipeline:

```text
DOM event
    ↓
PORT Web
    ↓
semantic interaction intent
    ↓
NEXUS
```

### Implement

* event registration
* event delegation where justified
* event cleanup
* interaction identity
* event-to-semantic translation
* lifecycle-safe handler updates

### Boundary

PORT reports what happened.

NEXUS determines what that means for the application.

For example:

```text
PORT:
"user-card-42 received select interaction"

NEXUS:
"Selecting user 42 changes application state"
```

PORT must not contain the second decision.

### Exit criteria

Real Web interactions can reach NEXUS without exposing raw browser event objects as application semantics.

---

# V0.4 — Styles and Accessibility

## Objective

Prove that Web-native styling and accessibility mechanisms can realize Valance semantics.

### Styles

Evaluate:

* CSS classes
* inline styles
* CSS variables
* style updates
* target-native style mechanisms

Do not invent a universal styling abstraction unless the Web implementation demonstrates that one is actually required.

### Accessibility

Evaluate:

* semantic HTML
* roles
* accessible names
* states
* properties
* focus behavior
* keyboard interaction

### Exit criteria

A representative application can preserve its semantic and accessibility requirements through the Web PORT.

---

# V0.5 — Update Model and Realization Lifecycle

**Status:** Established for today's MPRX. A program's trees all have the same structure, so an *update* changes props and text only, and every key keeps its DOM node (tested, and in the slice). A different program is *drawn* afresh, never reconciled by key. Insertion, removal and reordering can't occur until MESH adds lists or conditionals (audit U5); the Web PORT already treats a key only in the new tree as new and one only in the old tree as gone, as MESH's guide asks.

## Objective

Establish PORT as a real incremental realization system rather than a one-shot renderer.

### Must define

* identity preservation
* insertion
* removal
* reordering
* text updates
* property updates
* style updates
* event-handler updates
* reuse vs recreation
* ownership boundaries
* mount/update/unmount lifecycle

### Key question

When semantic input changes:

> What must remain the same, what may be replaced, and what must be recreated?

This phase should produce evidence for later optimization and hydration design.

### Exit criteria

Repeated application updates produce correct target state while preserving identity where semantics require it.

---

# V0.6 — Web Runtime Architecture

**Status:** Paused with V0.7 and V0.8. The server/browser split exists to serve SSR, and SSR is blocked on MESH (see V0.7).

## Objective

Separate browser and server realization paths while keeping their shared Web semantics explicit.

The architecture should become:

```text
             Web semantics
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
 Web Server PORT       Web Browser PORT
        │                   │
        ▼                   ▼
      HTML              DOM + CSS
                            │
                         Events
```

### Server path

Must not depend on:

* `window`
* `document`
* browser event APIs
* browser-only lifecycle assumptions

### Browser path

May use:

* DOM
* CSSOM
* browser events
* browser scheduling APIs
* other target-native browser mechanisms

### Exit criteria

Server and browser implementations have explicit responsibilities and do not depend on accidental browser globals.

---

# V0.7 — SSR

**Status: paused. Blocked on MESH.** Server HTML is attributes and text. MESH gives text only for text runs, so a number, boolean-as-text, `null`, list or record prop in an attribute has no text PORT may use. Producing one would be the second, Web-invented interpretation of values this project rules out. See the [value realization audit](./architecture/2026-09-27-value-realization-audit.md), whose question 1 at least must be answered first. Nothing is implemented, and no interim "render-v1 → Web HTML values" representation is built.

### Path, from the evidence so far

- The server path renders with the **same** MESH runtime and the **same** realization table: prop realizations are data (attribute names), not DOM functions, precisely so they serialize to the same HTML the browser path produces.
- The server path must not format values either. An attribute gets a string as given; everything else is the open question above.
- A value realized as a DOM property with no content attribute has no HTML form. Hydration applies it on the client from the tree.
- An empty text run realizes as an empty text node in the DOM, which HTML can't express. Hydration must create it (see V0.8).

## Objective

Produce real server-rendered HTML from a Valance application.

### Requirements

* route rendering
* server application state
* deterministic HTML
* hydration-compatible markup
* server lifecycle
* explicit server errors
* no browser-only APIs

### Important boundary

SSR is a **Web realization concern**.

It must not become a NEXUS feature.

NEXUS should not know about:

* `renderToString`
* HTTP
* browser globals
* HTML serialization
* DOM APIs
* SSR lifecycle

### Exit criteria

A real Valance route can produce HTML on the server without running a browser environment.

---

# V0.8 — Hydration and Client Takeover

**Status:** Paused with V0.7. The information hydration needs exists: the program (the composer knows it), the snapshot the server rendered (the server's composer has it), and MESH's determinism ("identical inputs give identical results"), so the client re-renders the same tree. Nothing needed is missing from both render-v1 and the composer. Moving the snapshot to the client is composer work (integration audit U8).

### Path, from the evidence so far

- **Identity by structure.** Every tree of one program has the same structure (audit F4), so hydration can pair server DOM with the tree in document order, with no keys in the markup. That presumes the composer tells the client PORT the server's program. Program continuity stays the composer's, as for *update* ([CONTRACT.md](./CONTRACT.md#program-continuity)). A mismatch (a different element, or a missing node) is detected explicitly, never patched silently.
- **One model, not two.** Hydration adopts server nodes into exactly the drawn-node records `draw` builds, then behaves as `update`. SSR adds no second identity or update model.
- **State crosses as the snapshot.** Dispatch needs a `Render` (NEXUS M1), and a `Render` can only be made by rendering. So the client renders the *serialized snapshot* the server rendered, gets the same tree, and adopts the server DOM for it. Who serializes the snapshot, the composer or NEXUS, is open (audit U8).

## Objective

Turn server-rendered HTML into the live browser application.

Pipeline:

```text
Server
  ↓
HTML
  ↓
Browser
  ↓
Hydration
  ↓
Interactive DOM
  ↓
SPA runtime
```

### Must establish

* element identity matching
* state reconstruction
* serialized application values
* event attachment
* update continuity
* mismatch detection
* mismatch behavior
* hydration failure behavior

### Principle

Hydration should reuse compatible server-rendered structure rather than blindly reconstructing the entire DOM.

### Exit criteria

A server-rendered route becomes a functioning interactive Valance application without semantic divergence between server and client.

---

# V0.9 — Application and Build Pipeline

## Objective

Build a Valance application into a deployable Web application.

### Requirements

* client bundle
* server bundle
* static assets
* production output
* development mode
* routing
* SSR build
* client build
* code splitting where justified

The build tool should be selected based on the architecture rather than forcing the architecture to fit a particular framework.

### Exit criteria

A Valance Web application can be built and deployed as an actual application rather than only executed from repository development tooling.

---

# V0.10 — End-to-End Reference Application

## Objective

Build one serious application that exercises the entire stack.

The reference application should include:

* multiple routes
* navigation
* application state
* list/detail views
* forms
* text input
* user interaction
* conditional content
* dynamic lists
* styles
* accessibility semantics
* SSR
* hydration
* client-side navigation
* state updates

Example:

```text
MPRX
 ↓
MESH
 ↓
semantic output
 ↓
NEXUS
 ↓
PORT Web
 ├── server → HTML
 └── browser → DOM
                    ↓
                hydration
                    ↓
                 SPA
```

### Purpose

This application is not primarily a showcase.

It is an architectural test.

Its job is to expose missing boundaries, incorrect assumptions, and accidental coupling between MESH, NEXUS, and PORT.

### Exit criteria

The reference application works end-to-end using the real Valance stack.

---

# V1.0 — Web PORT

## Definition

PORT V1 is complete when Valance can take a real application from MPRX through MESH and NEXUS into a Web realization that supports:

```text
Server
  ↓
HTML
  ↓
Browser
  ↓
Hydration
  ↓
Interactive SPA
```

### V1 acceptance criteria

#### Semantic boundary

* MESH remains renderer-independent.
* PORT consumes semantic guarantees rather than MESH implementation details.
* NEXUS remains independent of Web realization.

#### Web realization

* DOM realization works.
* CSS/style realization works.
* semantic HTML works.
* events work.
* accessibility semantics work.
* identity and updates work.
* mount/update/unmount lifecycle works.

#### SSR

* server rendering works.
* server code does not require browser globals.
* rendered output is deterministic enough for hydration.
* application state can cross the server/client boundary explicitly.

#### Hydration

* server markup can be adopted by the browser runtime.
* identity is preserved where required.
* events become active.
* application state is reconstructed.
* mismatches are detected and handled explicitly.

#### SPA

* client navigation works.
* state survives appropriate navigation.
* interactive updates work.
* the application remains a normal Web application after hydration.

#### Build/deployment

* production client build works.
* production server build works.
* static assets are emitted correctly.
* the resulting application is deployable.

#### Architecture

* no Web APIs leak into MESH.
* no Web APIs leak into NEXUS.
* PORT remains responsible for target realization.
* no universal renderer abstraction has been introduced merely for symmetry.
* target-specific implementation details remain inside PORT Web.

---

# 4. What V1 Should Not Attempt

PORT V1 should **not** attempt to solve every possible target.

Do not prematurely design abstractions for:

* native mobile
* desktop native widgets
* Canvas
* WebGPU
* GPU scene graphs
* game rendering
* universal layout
* universal styling
* universal event APIs
* universal widget APIs
* cross-platform component libraries

These become architectural questions only when another concrete target exposes a real incompatibility or missing abstraction.

---

# 5. Canvas

Canvas remains deferred, and has no package: the empty `port-canvas` placeholder was removed (audit, Gate 3).

The question is not:

> "How do we make Web and Canvas share an API?"

The useful question is:

> "After the Web PORT has exposed its real semantic boundary, what does Canvas require that Web does not?"

Only then should the architecture introduce additional lower representations or shared abstractions.

---

# 6. Evidence-Driven Generalization

The development strategy for PORT is:

```text
Implement Web
      ↓
Encounter real constraint
      ↓
Identify semantic requirement
      ↓
Determine whether it belongs upstream or in PORT
      ↓
Generalize only if justified
      ↓
Test against existing behavior
```

Not:

```text
Imagine every future target
      ↓
Design universal abstraction
      ↓
Force Web into abstraction
```

This distinction is fundamental to PORT development.

---

# 7. Long-Term Direction

After V1, additional targets should be introduced only when there is enough evidence to determine what should be shared.

A future architecture may eventually look like:

```text
                  Valance semantics
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
       PORT Web       PORT Native    PORT Canvas
          │              │              │
          ▼              ▼              ▼
       Browser       Native APIs      Canvas
```

But the shared layer should emerge from proven semantic requirements, not be designed in advance.

The goal is not to make every PORT internally identical.

The goal is to make each PORT capable of faithfully realizing the same Valance semantics on its target.

---

# 8. Development Order

The intended order is:

```text
Scaffold
   ↓
V0.1 Semantic boundary
   ↓
V0.2 Web DOM realization
   ↓
V0.3 Events
   ↓
V0.4 Styles + Accessibility
   ↓
V0.5 Updates + Identity
   ↓
V0.6 Server/Browser split
   ↓
V0.7 SSR
   ↓
V0.8 Hydration
   ↓
V0.9 Build + Deployment
   ↓
V0.10 Reference Application
   ↓
V1.0 Web PORT
```

Each stage should produce evidence that informs the next stage.

The roadmap should therefore be treated as a sequence of **architectural experiments with acceptance criteria**, not merely a list of implementation features.

---

# 9. Core Principle

> **PORT should generalize from evidence, not speculation.**

Web is the first target because it is capable of exercising nearly every important boundary:

* structured hierarchy
* identity
* updates
* styling
* accessibility
* events
* server rendering
* client rendering
* hydration
* routing
* deployment

If the PORT architecture survives a serious Web application, the resulting boundary will be grounded in an actual target rather than an imagined one.
