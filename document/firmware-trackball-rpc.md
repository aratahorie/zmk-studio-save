# Monokey Trackball Sensitivity RPC Implementation Guide

This document outlines the firmware-side work required so ZMK Studio Save can push trackball sensitivity settings to a Monokey-based build. The goal is to support the new `pointing.setSensitivity` RPC introduced in the UI while keeping backward compatibility with stock ZMK Studio.

## 1. Protocol Buffers & Transport

1. Extend the firmware-side protobuf definitions (e.g., `app/src/studio/protocol/pointing.proto`) with:

   ```proto
   syntax = "proto3";
   package zmk.pointing;

   message SensitivityScale {
     uint32 numerator = 1;
     uint32 denominator = 2;
   }

   message SetSensitivityRequest {
     SensitivityScale cursor = 1;
     optional SensitivityScale scroll = 2;
     optional uint32 cpi = 3;
   }

   enum SetSensitivityErrorCode {
     SET_SENSITIVITY_ERR_OK = 0;
     SET_SENSITIVITY_ERR_UNSUPPORTED = 1;
     SET_SENSITIVITY_ERR_INVALID = 2;
     SET_SENSITIVITY_ERR_STORAGE = 3;
   }

   message SetSensitivityResponse {
     oneof result {
       bool ok = 1;
       SetSensitivityErrorCode err = 2;
     }
   }

   message Request {
     oneof request {
       SetSensitivityRequest setSensitivity = 1;
     }
   }

   message Response {
     oneof response {
       SetSensitivityResponse setSensitivity = 1;
     }
   }
   ```

2. Regenerate the firmware-side C structs/enums using the same tooling already used for existing Studio messages (typically `nanopb_generator`).
3. Update the Studio transport multiplexer to dispatch `pointing` requests to a new handler (similar to how `keymap` and `core` requests are wired).
4. When the protobuf schema is finalized, publish the updated TypeScript client (`@zmkfirmware/zmk-studio-ts-client`) so the UI can remove its temporary `any` casts.

## 2. Firmware Handler

Implement a handler (e.g., `app/src/studio/pointing_handler.c`) that:

1. Confirms the board exposes a `trackball_listener` node with `zip_xy_scaler` processors. If not available, return `SET_SENSITIVITY_ERR_UNSUPPORTED`.
2. Validates the request:
   - Denominator must be non-zero.
   - Numerator and denominator should fit within a sensible range (e.g., 1–32767).
3. Applies the new values to the active listener:
   - Update the cursor `zip_xy_scaler` ratio.
   - If `scroll` is present, update `zip_xy_to_scroll_mapper` scaler; otherwise, remove/disable the override.
   - If `cpi` is provided and the sensor driver exposes a setter, apply it; otherwise, ignore.
4. Persists settings via the ZMK `settings` subsystem:
   - Store in a new subtree (e.g., `settings_save_one("monokey/trackball/cursor_scale", &scale, sizeof(scale));`).
   - Reload values during boot and after settings reset.
5. Responds with `ok = true` on success or a suitable error code on failure.

### Optional `getSensitivity`

For a richer UX, add a `pointing.getSensitivity` RPC that returns the current values. This is not strictly required—the UI can fall back to saved defaults—but it helps when users connect without importing a save file.

## 3. Settings Integration

1. Define a small settings struct (e.g., numerator/denominator pairs plus CPI).
2. Register load/save callbacks so the firmware restores stored values at boot.
3. Provide a reset hook that clears the settings when ZMK Studio requests `core.resetSettings`.

## 4. Monokey Board Changes

1. Ensure the Monokey shield enables the trackball listener exactly once (for both halves if split). Keep layer overrides removed, since runtime scaling will take over.
2. Wire the settings load to the listener so saved values override defaults immediately after boot.
3. Verify the listener is built only for Monokey builds to avoid affecting other shields.

## 5. Testing Checklist

- Unit-test the handler logic with synthetic requests covering:
  - Valid cursor + scroll updates.
  - Unsupported configurations (no trackball listener present).
  - Invalid numerator/denominator combinations.
  - Settings storage failures (simulate).
- Integration-test on hardware:
  1. Flash firmware with the new handler and settings support.
  2. Connect ZMK Studio Save.
  3. Move the sliders to new values and click Save—observe immediate cursor/scroll speed change.
  4. Power-cycle the board to confirm persistence.
  5. Connect with stock ZMK Studio to ensure no regressions (extra RPC simply won’t be used).

## 6. Deployment Notes

- Publish the updated `@zmkfirmware/zmk-studio-ts-client` package once firmware support is merged so the frontend can switch from provisional casts to typed calls.
- Document the new RPC in the Monokey README or release notes for builders who rely on ZMK Studio Save.
