# The PORT contract, version 1

This is what every PORT promises, in any language, on any target. It is deliberately small. It is derived from MESH v0.5's render-tree format and its renderer and host obligations, and from NEXUS v0.8's boundary rules. The evidence is in the [integration audit](./architecture/2026-09-27-port-integration-audit.md).

It is **not** an API. Each PORT binds these operations to its own language and target however suits them. The Web PORT's binding is [`@valancex/port-web`](../packages/port-web/README.md).

## Who is involved

```text
            NEXUS  (Nexus.Mesh.host: render, renders, dispatch)
              ▲ │
   dispatch   │ │ Render
 (render, h, p)│ ▼
            composer  ── keeps the Render whose tree is drawn
              ▲ │
report (h, p) │ │ draw(tree) / update(tree) / unmount()
              │ ▼
             PORT  ── realizes on ──▶ target
```

- **PORT** realizes render trees on one target and reports what the user does.
- **The composer** is whoever assembles the application: app code, a test, or later, tooling. It holds a NEXUS MESH host and a PORT, and connects them. NEXUS and PORT never depend on each other (NEXUS `docs/ARCHITECTURE.md` §16).

## Input: a render-v1 tree

PORT's only data input is a MESH render tree, as defined by MESH's [`render-v1.schema.json`](https://github.com/ValanceX/Mesh/blob/main/schemas/render-v1.schema.json) and [runtime manual](https://github.com/ValanceX/Mesh/blob/main/docs/manual/runtime.md). PORT does not redefine it, wrap it or extend it.

A PORT:
- accepts `format: "mesh-render"`, `version: 1`, and **refuses** any other format or version;
- **ignores** properties it doesn't know (the schema is additive within a version);
- never receives a MESH `Render`, a template, a manifest, a command intent, or anything from NEXUS.

## Operations

| Operation | Meaning | When the composer uses it |
|---|---|---|
| **draw(tree)** | Realize `tree` afresh, discarding whatever was realized before. No target object is reused. | The first tree, and any tree the composer knows comes from a **different program** than the drawn one. |
| **update(tree)** | The composer asserts that `tree` comes from the **same program** as the drawn tree. Realize its changes in place: the target object for each key present in both trees is kept. | Every later tree the composer knows comes from the same program. |
| **unmount()** | Remove the realization. Nothing is reported after it. | When the UI goes away. |

### Program continuity

*draw* and *update* are not two ways of rendering. They carry one fact, **program continuity**: whether the incoming tree comes from the same MESH program as the drawn tree. That fact decides whether keys may be compared at all. MESH makes keys comparable only within one program, and may give two programs overlapping keys: a key says nothing about which program produced it.

> **PORT never determines whether two render trees belong to the same MESH program.** The composer does.

- **Only the composer knows.** It chose which host (and so which program) produced each `Render`, so it knows when the program changed: a template recompiled, added or removed, or a different root. MESH requires the host to say so (runtime manual: the host "tells its renderer when a new tree comes from a different program"). A `Render` doesn't expose its program identity, render-v1 carries none, and none is to be added.
- **PORT infers nothing** from keys, handler identifiers, tree shape, component names, payloads or any other property of render-v1. A *draw* reuses nothing, even when every key matches the drawn tree. An *update* reconciles by key, even when the tree looks nothing like the drawn one.
- **An update whose structure differs** doesn't make PORT decide that the program changed. PORT stays at the key level: a key only in the new tree is new, a key only in the old one is gone, as MESH's guide says. Within one program this never happens, because MPRX has no loops or conditional elements.
- **Consequence of a wrong signal:** an *update* given a different program's tree is reconciled by key, which is meaningless across programs. That is the composer's error, and PORT can't detect it.

## Output: interaction reports

When the user interacts with a realized node, PORT reports:

```text
report(handler, payload?)
```

- `handler` is the handler identifier the **drawn** tree gives for that node's event. PORT never interprets it.
- `payload` is a value from MESH's boundary data model, or absent. What the payload is for a given event is declared in the application's manifest; how a target event produces it is the PORT's realization decision.

The composer passes the report to `host.dispatch(render, handler, payload)` with the `Render` whose tree was drawn. PORT never sees an intent or a command, and target event objects never leave PORT.

## Obligations

A PORT:

1. **Realizes values as given.** It formats, defaults and converts nothing. If a target slot can hold only text and the value isn't a string, the PORT reports that as a realization error rather than inventing text.
2. **Surfaces unknown components.** A node whose component the PORT has no realization for is made visible, never dropped.
3. **Drops nothing silently.** A prop or event in the tree that the PORT cannot realize is an error, not an omission.
4. **Keeps identity.** Between *update*s, each key is realized by the same target object.
5. **Compares keys and handler identifiers only for equality**, and parses neither.
6. **Depends on neither NEXUS nor the MESH runtime.** It may use the render-tree *types*.
7. **Owns everything target-specific,** including what each of the application's primitive components becomes on its target. MESH has no Valance-wide primitive set: an application's manifest declares its primitives, and the PORT is configured with their realizations.

## Not in version 1

These are deliberately absent, because nothing upstream provides them yet or nothing consumes them. Each is an open question in the audit.

- target capability descriptions (no consumer);
- accessibility semantics and styling (render-v1 carries none);
- lists, conditional content, insertion, removal and reordering (MPRX has none);
- server rendering and hydration (see the [roadmap](./ROADMAP.md)).

## Conformance

Each PORT proves this contract with its own tests, against trees produced by the real MESH runtime where possible, and against small hand-written render-v1 trees for edge cases. The Web PORT's are in [`packages/port-web/test`](../packages/port-web/test), and the full MESH → NEXUS → PORT Web slice is in [`integration/`](../integration).
