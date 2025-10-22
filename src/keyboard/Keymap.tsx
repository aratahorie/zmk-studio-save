import {
  PhysicalLayout,
  Keymap as KeymapMsg,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

import {
  LayoutZoom,
  PhysicalLayout as PhysicalLayoutComp,
} from "./PhysicalLayout";
import { HidUsageLabel } from "./HidUsageLabel";
import {
  hid_usage_get_labels,
  hid_usage_page_and_id_from_usage,
} from "../hid-usages";

type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

// Shortened display names for behaviors to fit in keys
const behaviorShortNames: Record<string, { short: string; med?: string }> = {
  Transparent: { short: "▽", med: "Trans" },
  "Layer Tap": { short: "LT", med: "LT" },
  "Momentary Layer": { short: "MO", med: "MO" },
  "Toggle Layer": { short: "TG", med: "TG" },
  "To Layer": { short: "TO", med: "TO" },
  "Mouse Move": { short: "MM", med: "MM" },
  "Mouse Scroll": { short: "MS", med: "MS" },
  "Mouse Key Press": { short: "MK", med: "MK" },
  "Key Press": { short: "KP", med: "KP" },
  Bluetooth: { short: "BT", med: "BT" },
  Bootloader: { short: "Boot", med: "Boot" },
};

// Mouse button mappings
const mouseButtonNames: Record<number, string> = {
  1: "Left Click",
  2: "Right Click",
  3: "Middle Click",
  4: "Back",
  5: "Forward",
};

// Modifier key short names for Mod-Tap display
const modifierShortNames: Record<string, string> = {
  "LeftControl": "Ctrl",
  "RightControl": "Ctrl",
  "LeftShift": "Shift",
  "RightShift": "Shift",
  "LeftAlt": "Alt",
  "RightAlt": "Alt",
  "LeftGUI": "GUI",
  "RightGUI": "GUI",
};

function getMouseButtonLabel(buttonNumber: number): {
  short: string;
  med: string;
  long: string;
} {
  const name = mouseButtonNames[buttonNumber] || `Button ${buttonNumber}`;
  const shortMap: Record<string, string> = {
    "Left Click": "LFT",
    "Right Click": "RGT",
    "Middle Click": "MID",
    Back: "BCK",
    Forward: "FWD",
  };
  const medMap: Record<string, string> = {
    "Left Click": "LFT",
    "Right Click": "RGT",
    "Middle Click": "MID",
    Back: "BACK",
    Forward: "FWD",
  };
  return {
    short: shortMap[name] || name,
    med: medMap[name] || name,
    long: name,
  };
}


function getBehaviorLabels(displayName: string): {
  short: string;
  med: string;
  long: string;
} {
  const shortened = behaviorShortNames[displayName];
  return {
    short: shortened?.short || displayName,
    med: shortened?.med || displayName,
    long: displayName,
  };
}

export interface KeymapProps {
  layout: PhysicalLayout;
  keymap: KeymapMsg;
  behaviors: BehaviorMap;
  scale: LayoutZoom;
  selectedLayerIndex: number;
  selectedKeyPosition: number | undefined;
  onKeyPositionClicked: (keyPosition: number) => void;
}

export const Keymap = ({
  layout,
  keymap,
  behaviors,
  scale,
  selectedLayerIndex,
  selectedKeyPosition,
  onKeyPositionClicked,
}: KeymapProps) => {
  if (!keymap.layers[selectedLayerIndex]) {
    return <></>;
  }

  const positions = layout.keys.map((k, i) => {
    if (i >= keymap.layers[selectedLayerIndex].bindings.length) {
      return {
        id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
        header: "Unknown",
        x: k.x / 100.0,
        y: k.y / 100.0,
        width: k.width / 100,
        height: k.height / 100.0,
        children: <span></span>,
      };
    }

    const binding = keymap.layers[selectedLayerIndex].bindings[i];
    const behavior = behaviors[binding.behaviorId];
    const displayName = behavior?.displayName || "Unknown";

    // Special handling for Layer Tap: param1 might be layer, param2 might be key
    // Try both combinations to find which is the valid HID usage
    // Support both "Layer Tap" and "Layer-Tap" as display names
    if (displayName === "Layer Tap" || displayName === "Layer-Tap") {
      // Check if param1 is a valid HID usage
      let keyParam = binding.param1;
      let layerParam = binding.param2;
      let hasValidKey = false;

      if (keyParam && keyParam !== 0) {
        const [page, id] = hid_usage_page_and_id_from_usage(keyParam);
        const labels = hid_usage_get_labels(page & 0xff, id);
        hasValidKey = !!labels.short;
      }

      // If param1 is not valid, try param2 as key and param1 as layer
      if (!hasValidKey && binding.param2 && binding.param2 !== 0) {
        const [page, id] = hid_usage_page_and_id_from_usage(binding.param2);
        const labels = hid_usage_get_labels(page & 0xff, id);
        if (labels.short) {
          keyParam = binding.param2;
          layerParam = binding.param1;
          hasValidKey = true;
        }
      }

      if (hasValidKey) {
        return {
          id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
          header: `LT:${layerParam || 0}`,
          x: k.x / 100.0,
          y: k.y / 100.0,
          width: k.width / 100,
          height: k.height / 100.0,
          r: (k.r || 0) / 100.0,
          rx: (k.rx || 0) / 100.0,
          ry: (k.ry || 0) / 100.0,
          children: <HidUsageLabel hid_usage={keyParam} />,
        };
      }
    }

    // Check if param1 represents a valid HID usage
    let hasValidHidUsage = false;
    if (binding.param1 && binding.param1 !== 0) {
      const [page, id] = hid_usage_page_and_id_from_usage(binding.param1);
      const labels = hid_usage_get_labels(page & 0xff, id);
      hasValidHidUsage = !!labels.short;
    }

    // Key Press should not show header, just the key itself
    if (displayName === "Key Press" && hasValidHidUsage) {
      return {
        id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
        header: undefined,
        x: k.x / 100.0,
        y: k.y / 100.0,
        width: k.width / 100,
        height: k.height / 100.0,
        r: (k.r || 0) / 100.0,
        rx: (k.rx || 0) / 100.0,
        ry: (k.ry || 0) / 100.0,
        children: <HidUsageLabel hid_usage={binding.param1} />,
      };
    }

    // Special handling for Mouse Button: show specific button names (no header)
    if (displayName === "Mouse Button") {
      const mouseLabels = getMouseButtonLabel(binding.param1 || 0);
      return {
        id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
        header: undefined,
        x: k.x / 100.0,
        y: k.y / 100.0,
        width: k.width / 100,
        height: k.height / 100.0,
        r: (k.r || 0) / 100.0,
        rx: (k.rx || 0) / 100.0,
        ry: (k.ry || 0) / 100.0,
        children: (
          <span
            className="@[5em]:before:content-[attr(data-long-content)] @[3em]:before:content-[attr(data-med-content)] before:content-[attr(aria-label)] text-xs"
            aria-label={mouseLabels.short}
            data-med-content={mouseLabels.med}
            data-long-content={mouseLabels.long}
          />
        ),
      };
    }

    // Special handling for Mouse Key Press: show "Mouse" as header, button name in center
    if (displayName === "Mouse Key Press") {
      const mouseLabels = getMouseButtonLabel(binding.param1 || 0);
      return {
        id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
        header: "Mouse",
        x: k.x / 100.0,
        y: k.y / 100.0,
        width: k.width / 100,
        height: k.height / 100.0,
        r: (k.r || 0) / 100.0,
        rx: (k.rx || 0) / 100.0,
        ry: (k.ry || 0) / 100.0,
        children: (
          <span
            className="@[5em]:before:content-[attr(data-long-content)] @[3em]:before:content-[attr(data-med-content)] before:content-[attr(aria-label)] text-xs"
            aria-label={mouseLabels.short}
            data-med-content={mouseLabels.med}
            data-long-content={mouseLabels.long}
          />
        ),
      };
    }

    // Special handling for Mod-Tap: show modifier as header, key in center
    if (displayName === "Mod-Tap") {
      // param1 is the modifier, param2 is the key
      const modifierParam = binding.param1;
      const keyParam = binding.param2;

      // Check if param2 is a valid HID usage (the key)
      let hasValidKey = false;
      if (keyParam && keyParam !== 0) {
        const [page, id] = hid_usage_page_and_id_from_usage(keyParam);
        const labels = hid_usage_get_labels(page & 0xff, id);
        hasValidKey = !!labels.short;
      }

      if (hasValidKey && modifierParam && modifierParam !== 0) {
        // Get modifier label
        const [modPage, modId] = hid_usage_page_and_id_from_usage(modifierParam);
        const modLabels = hid_usage_get_labels(modPage & 0xff, modId);
        const modName = modLabels.short?.replace(/^Keyboard /, "") || "Mod";
        const modLabel = modifierShortNames[modName] || modName;

        return {
          id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
          header: modLabel,
          x: k.x / 100.0,
          y: k.y / 100.0,
          width: k.width / 100,
          height: k.height / 100.0,
          r: (k.r || 0) / 100.0,
          rx: (k.rx || 0) / 100.0,
          ry: (k.ry || 0) / 100.0,
          children: <HidUsageLabel hid_usage={keyParam} />,
        };
      }
    }

    // Special handling for To Layer: show "To" as header, layer number in center
    if (displayName === "To Layer") {
      const layerNumber = binding.param1 ?? 0;
      return {
        id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
        header: "To",
        x: k.x / 100.0,
        y: k.y / 100.0,
        width: k.width / 100,
        height: k.height / 100.0,
        r: (k.r || 0) / 100.0,
        rx: (k.rx || 0) / 100.0,
        ry: (k.ry || 0) / 100.0,
        children: <span className="text-xs">{layerNumber}</span>,
      };
    }


    // For special keys (layer switching, mouse buttons, etc.) without valid HID usage,
    // display the behavior name with shortened labels
    const behaviorLabels = getBehaviorLabels(displayName);

    return {
      id: `${keymap.layers[selectedLayerIndex].id}-${i}`,
      header: undefined, // Don't show header by default
      x: k.x / 100.0,
      y: k.y / 100.0,
      width: k.width / 100,
      height: k.height / 100.0,
      r: (k.r || 0) / 100.0,
      rx: (k.rx || 0) / 100.0,
      ry: (k.ry || 0) / 100.0,
      children: hasValidHidUsage ? (
        <HidUsageLabel hid_usage={binding.param1} />
      ) : (
        <span
          className="@[5em]:before:content-[attr(data-long-content)] @[3em]:before:content-[attr(data-med-content)] before:content-[attr(aria-label)] text-xs"
          aria-label={behaviorLabels.short}
          data-med-content={behaviorLabels.med}
          data-long-content={behaviorLabels.long}
        />
      ),
    };
  });

  return (
    <PhysicalLayoutComp
      positions={positions}
      oneU={48}
      hoverZoom={true}
      zoom={scale}
      selectedPosition={selectedKeyPosition}
      onPositionClicked={onKeyPositionClicked}
    />
  );
};
