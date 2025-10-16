# Firmware Integration Specification — Monokey & ZMK Studio Save

## Audience & Scope
- **Audience:** Firmware developers maintaining `zmk-config-monokey`.
- **Scope:** Consume the extended save-file produced by ZMK Studio Save, generate combo definitions, and apply trackball sensitivity without layer hacks.
- **Out of scope:** Frontend work in ZMK Studio Save (handled separately), live runtime RPC integration, or generalized upstream ZMK changes.

## Background
- The Monokey shield currently defines a single combo (`scroll`) and manages trackball sensitivity by switching layers (`sensitivity_50`–`sensitivity_140`) plus a scroll layer override. See `config/monokey.keymap:17` and `config/boards/shields/monokey/monokey_R.overlay:20`.
- The trackball uses a PixArt PMW3610 on `spi0` with an `input-listener` and several `zip_xy_scaler` overrides.
- Goal: Allow ZMK Studio Save to export both keymap data and pointing-device settings, then generate firmware configuration directly from that export (no layer indirection).

## Functional Requirements
1. **Combo configuration**
   - Read combo definitions from the save JSON and render them into the device tree (`zmk,combos` node).
   - Support multiple combos, each with explicit key positions and bindings.
2. **Trackball sensitivity configuration**
   - Read cursor and scroll sensitivity values from the save file.
   - Update the `trackball_listener` node so that cursor and scroll scaling reflect the chosen settings without layer overrides.
3. **Build integrity**
   - Resulting DTS files must compile with `west build` without warnings or errors.
   - Existing behavior (right click definition, keymap layers, automouse activation on layer 4) must remain intact unless explicitly changed by the save data.

## Non-Functional Requirements
- Implementation should be deterministic and idempotent: re-running generation with the same save file should yield identical DTS content.
- Guard against malformed input with clear error messages (e.g., exit non-zero from generation script).
- Keep custom logic confined to repository-local scripts/configs; no upstream ZMK patches required.

## Data Contract (from ZMK Studio Save)
ZMK Studio Save will export a JSON document with the structure below. Keymap payload mirrors current exports; new sections are `combos` and `pointing`.

```jsonc
{
  "keymap": { /* existing schema */ },
  "combos": [
    {
      "id": "scroll-toggle",
      "label": "Scroll mode",
      "triggerPositions": [27, 28],
      "output": {
        "type": "behavior",
        "binding": "&mo 5"
      },
      "timeoutMs": 30,
      "requiredModifiers": [],
      "tapHoldIntervalMs": null
    }
  ],
  "pointing": {
    "device": "pmw3610",
    "cursor": {
      "scale": [1, 1],        // numerator, denominator
      "cpi": 1000             // optional, for future use
    },
    "scroll": {
      "mode": "mapper",       // fixed for now
      "scale": [1, 20]
    },
    "metadata": {
      "generatedAt": "2024-03-01T12:34:56.000Z",
      "baseLayer": 4          // automouse layer (mirrors existing overlay)
    }
  }
}
```

### Notes
- `triggerPositions` reference the physical key indices defined in `monokey_physical_layout`; matches current Studio save behavior.
- `output.type` is scoped for future extensibility (`"behavior"` for `&mo`, `&kp`, etc.). Additional types (e.g., `macro`) can be added later.
- `scale` arrays are `[numerator, denominator]` integers. Cursor scale `[1, 1]` equals 100%; `[1, 2]` equals 50%.
- `scroll.mode` is fixed to `"mapper"` until another mode is introduced; treat presence as enabling the `zip_xy_to_scroll_mapper`.
- `metadata.baseLayer` carries the layer number Studio expects for automouse. Firmware should keep `automouse-layer = <4>;` unless this value changes.

## Firmware Integration Plan

### Overview
Create a generation step that consumes the save JSON and rewrites:
1. `config/monokey.keymap` → `combos` subtree.
2. `config/boards/shields/monokey/monokey_R.overlay` → `trackball_listener` subtree (cursor + scroll scaling).

Prefer a script (e.g., `scripts/apply_studio_save.py`) invoked before `west build`.

### Detailed Steps
1. **Input handling**
   - Read save file path from CLI argument or environment variable (e.g., `STUDIO_SAVE_JSON`).
   - Parse JSON; validate presence of `combos` and `pointing`. On failure, abort with descriptive error.

2. **Combos generation (`config/monokey.keymap`)**
   - Preserve existing includes (`behaviors.dtsi`, `dt-bindings/...`) and custom behavior nodes (e.g., `right_click`).
   - Replace contents of `/ { combos { ... } };` with definitions generated from `combos[]`.
   - Template for each combo:
     ```dts
     combo_id {
         timeout-ms = <30>;          // omit property if null
         bindings = <&mo 5>;
         key-positions = <27 28>;
     };
     ```
   - Optional properties:
     - `required-mods = <...>;` if `requiredModifiers` is non-empty (map to ZMK mod constants).
     - `slow-release;` if we later support release hints—currently unused.
   - Ensure node identifiers are valid DTS labels (sanitize `id` by replacing invalid characters with `_`).

3. **Trackball listener generation (`monokey_R.overlay`)**
   - Retain SPI, pinctrl, and device definitions as-is.
   - Rebuild the `trackball_listener` node:
     ```dts
     trackball_listener {
         compatible = "zmk,input-listener";
         device = <&trackball>;

         input-processors = <&zip_xy_scaler CUR_NUM CUR_DEN>;

         scroll_override {
             input-processors = <&zip_xy_to_scroll_mapper &zip_scroll_scaler SCR_NUM SCR_DEN>;
         };
     };
     ```
   - Drop legacy `sens_*_override` child nodes; we no longer rely on layer-based scaling.
   - Keep `automouse-layer = <metadata.baseLayer>;` under the `trackball@0` node (unchanged unless metadata requests otherwise).
   - If scroll section is omitted in JSON, skip generating `scroll_override`.

4. **Script structure**
   - Implement as a Python script (or Node, matching repo tooling preference) with:
     - Functions to load template DTS, locate insertion markers, and rewrite sections.
     - Unit tests (optional but recommended) to ensure generation is stable.
   - Consider storing canonical template files (e.g., `.tmpl`) and letting the script emit full DTS to avoid complex in-place editing.

5. **Integration into build**
   - Provide `make` or npm script alias, e.g., `npm run apply-save -- path/to/save.json`, which calls the generator and then `west build`.
   - Document the flow in repo README.
   - Failing to run the generator should leave existing DTS untouched.

### Validation
- After generation, run:
  ```bash
  west build -b seeeduino_xiao_ble config
  ```
  (Adjust board target if needed.)
- Confirm no DTS warnings about duplicate nodes or undefined macros.
- Optionally diff generated DTS against previous commit to review updates.

## Edge Cases & Error Handling
- **Missing combos array:** Leave `/combos` empty but keep node scaffold.
- **Unknown bindings:** Validate `output.binding` against allowed prefixes (`&kp`, `&mo`, `&bt`, etc.). Reject or warn on unsupported forms.
- **Scale values:** Ensure denominators are non-zero; clamp to reasonable range (e.g., numerator, denominator between 1 and 32 to align with existing ratios).
- **Device mismatch:** If `pointing.device` differs from `pmw3610`, emit warning but continue (allows future hardware).

## Runtime RPC Extension (Monokey)
To let ZMK Studio push sensitivity changes without a rebuild, add a dedicated RPC endpoint to the Monokey firmware:

- **Request namespace:** `pointing`.
- **Method:** `setSensitivity`.
- **Request payload:**

```proto
message SetSensitivityRequest {
  message Scale {
    uint32 numerator = 1;
    uint32 denominator = 2;
  }

  Scale cursor = 1;        // Required: cursor scaling ratio
  Scale scroll = 2;        // Optional: scroll scaling; omit to disable override
  optional uint32 cpi = 3; // Optional: raw sensor CPI value (if supported)
}
```

- **Response payload:**

```proto
message SetSensitivityResponse {
  oneof result {
    bool ok = 1;                      // Success marker
    SetSensitivityErrorCode err = 2;  // Failure reason
  }
}

enum SetSensitivityErrorCode {
  SET_SENSITIVITY_ERR_OK = 0;
  SET_SENSITIVITY_ERR_UNSUPPORTED = 1; // Firmware missing trackball listener
  SET_SENSITIVITY_ERR_INVALID = 2;     // Out-of-range values
  SET_SENSITIVITY_ERR_STORAGE = 3;     // Settings subsystem failure
}
```

- **Handling:**
  1. Convert percentages from Studio to `Scale` by reducing the fraction (e.g., 150 % → `3/2`).
  2. Update the active `zip_xy_scaler` / scroll mapper instances in memory immediately.
  3. Persist values via the ZMK `settings` subsystem so they survive reboot.
  4. Emit `SET_SENSITIVITY_ERR_UNSUPPORTED` when the board lacks a compatible listener; Studio will fall back gracefully.

- **Optional companion RPC:** `pointing.getSensitivity -> SetSensitivityRequest` to report current values when Studio connects. If unimplemented, Studio defaults to the values stored in its save file.

- **Compatibility note:** The stock ZMK Studio does not issue `pointing.*` RPCs, so the new handler should coexist without affecting existing workflows.

## Deliverables
1. Generation script committed under `scripts/`.
2. Updated DTS files demonstrating output from a sample save exported by Studio.
3. Build validation log (manual or CI) showing `west build` success post-generation.
4. Documentation update describing how to run the generator (README or `document/`).

## Future Extensions (reference)
- Allow multiple sensitivity presets by generating dedicated `settings` entries and a simple RPC or key combo to cycle presets.
- Support firmware-side persistence using ZMK `settings` subsystem (requires custom behavior to load from flash).
- Extend combos schema to include hold behaviors, tap vs. toggle actions, or positional constraints.

---
Contact: ZMK Studio Save frontend maintainer (current POC) for clarification on JSON fields or additional metadata needs.
