/**
 * The Web PORT's opt-in vocabulary, `@valancex/port-web/vocabulary` (Provisional; north-star refinements, C-2): the portable core (`column`, `row`, `heading`, `text`, `button`,
 * `checkbox`, `textfield`) realized for the Web, as data, so a first screen needs one import instead of a hand-written table. It is not a default: `createWebPort` and
 * `composeWebPort` still require `primitives`, and an application that wants more, or less, spreads or replaces it. `vocabularyManifest` is the MESH manifest of the same components,
 * mirroring `@valancex/port-desktop-vocabulary`'s `vocabulary.json` (a test keeps them equal), so the two PORTs name the same components, props and events.
 *
 * @packageDocumentation
 */
import type { WebPrimitives } from "./index.js";

import { attribute, booleanAttribute, controlled, controlledBoolean } from "./primitives.js";

/** The portable core's realizations on the Web: the elements and slots Valance's own web vocabulary uses for these components. */
export const vocabulary: WebPrimitives = {
  column: { element: "vlx-column", attributes: { "data-vlx": "column" } },
  row: { element: "vlx-row", attributes: { "data-vlx": "row" } },
  heading: { element: "h2", attributes: { "data-vlx": "heading" }, props: { level: attribute("aria-level") } },
  text: { element: "span", attributes: { "data-vlx": "text" }, props: { id: attribute("id") } },
  button: {
    element: "button",
    attributes: { "data-vlx": "button" },
    props: { id: attribute("id"), label: attribute("aria-label"), disabled: booleanAttribute("disabled"), intent: attribute("data-intent"), size: attribute("data-size") },
    events: { click: { type: "click" } },
  },
  checkbox: {
    element: "input",
    attributes: { type: "checkbox", "data-vlx": "checkbox" },
    props: { checked: controlledBoolean("checked"), label: attribute("aria-label"), invalid: attribute("aria-invalid"), describedby: attribute("aria-describedby") },
    events: { change: { type: "change", payload: (_event, element) => (element as HTMLInputElement).checked } },
  },
  textfield: {
    element: "input",
    attributes: { "data-vlx": "textfield" },
    props: { value: controlled("value"), placeholder: attribute("placeholder"), label: attribute("aria-label"), kind: attribute("type"), invalid: attribute("aria-invalid"), describedby: attribute("aria-describedby") },
    events: {
      change: { type: "input", payload: (_event, element) => (element as HTMLInputElement).value },
      submit: { type: "keydown", key: "Enter" },
      cancel: { type: "keydown", key: "Escape" },
      focus: { type: "focus" },
      blur: { type: "blur" },
    },
  },
};

/** The MESH manifest of the same components (props, events, payloads). */
export const vocabularyManifest = {
  "version": 1,
  "types": {},
  "components": {
    "column": {
      "props": {},
      "events": {},
      "commands": {},
      "scope": {}
    },
    "row": {
      "props": {},
      "events": {},
      "commands": {},
      "scope": {}
    },
    "heading": {
      "props": {
        "level": {
          "type": {
            "kind": "number"
          },
          "required": false
        }
      },
      "events": {},
      "commands": {},
      "scope": {}
    },
    "text": {
      "props": {
        "id": {
          "type": {
            "kind": "string"
          },
          "required": false
        }
      },
      "events": {},
      "commands": {},
      "scope": {}
    },
    "button": {
      "props": {
        "id": {
          "type": {
            "kind": "string"
          },
          "required": false
        },
        "disabled": {
          "type": {
            "kind": "boolean"
          },
          "required": false
        },
        "label": {
          "type": {
            "kind": "string"
          },
          "required": false
        },
        "intent": {
          "type": {
            "kind": "enum",
            "values": [
              "neutral",
              "primary",
              "danger"
            ]
          },
          "required": false
        },
        "size": {
          "type": {
            "kind": "enum",
            "values": [
              "sm",
              "md",
              "lg"
            ]
          },
          "required": false
        }
      },
      "events": {
        "click": {}
      },
      "commands": {},
      "scope": {}
    },
    "checkbox": {
      "props": {
        "checked": {
          "type": {
            "kind": "boolean"
          },
          "required": true
        },
        "label": {
          "type": {
            "kind": "string"
          },
          "required": false
        },
        "invalid": {
          "type": {
            "kind": "boolean"
          },
          "required": false
        },
        "describedby": {
          "type": {
            "kind": "string"
          },
          "required": false
        }
      },
      "events": {
        "change": {
          "payload": {
            "kind": "boolean"
          }
        }
      },
      "commands": {},
      "scope": {}
    },
    "textfield": {
      "props": {
        "value": {
          "type": {
            "kind": "string"
          },
          "required": true
        },
        "placeholder": {
          "type": {
            "kind": "string"
          },
          "required": false
        },
        "label": {
          "type": {
            "kind": "string"
          },
          "required": false
        },
        "kind": {
          "type": {
            "kind": "string"
          },
          "required": false
        },
        "invalid": {
          "type": {
            "kind": "boolean"
          },
          "required": false
        },
        "describedby": {
          "type": {
            "kind": "string"
          },
          "required": false
        }
      },
      "events": {
        "change": {
          "payload": {
            "kind": "string"
          }
        },
        "submit": {},
        "cancel": {},
        "blur": {},
        "focus": {}
      },
      "commands": {},
      "scope": {}
    }
  }
} as const;
