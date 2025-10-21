import { useEffect, useMemo, useState } from "react";

import {
  GetBehaviorDetailsResponse,
  BehaviorBindingParametersSet,
} from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { BehaviorParametersPicker } from "./BehaviorParametersPicker";
import { validateValue } from "./parameters";

export interface BehaviorBindingPickerProps {
  binding: BehaviorBinding;
  behaviors: GetBehaviorDetailsResponse[];
  layers: { id: number; name: string }[];
  onBindingChanged: (binding: BehaviorBinding) => void;
}

function validateBinding(
  metadata: BehaviorBindingParametersSet[],
  layerIds: number[],
  param1?: number,
  param2?: number
): boolean {
  if (
    (param1 === undefined || param1 === 0) &&
    metadata.every((s) => !s.param1 || s.param1.length === 0)
  ) {
    return true;
  }

  let matchingSet = metadata.find((s) =>
    validateValue(layerIds, param1, s.param1)
  );

  if (!matchingSet) {
    return false;
  }

  return validateValue(layerIds, param2, matchingSet.param2);
}

export const BehaviorBindingPicker = ({
  binding,
  layers,
  behaviors,
  onBindingChanged,
}: BehaviorBindingPickerProps) => {
  const [behaviorId, setBehaviorId] = useState(binding.behaviorId);
  const [param1, setParam1] = useState<number | undefined>(binding.param1);
  const [param2, setParam2] = useState<number | undefined>(binding.param2);

  const metadata = useMemo(
    () => behaviors.find((b) => b.id == behaviorId)?.metadata,
    [behaviorId, behaviors]
  );

  const sortedBehaviors = useMemo(
    () => behaviors.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [behaviors]
  );

  useEffect(() => {
    if (
      binding.behaviorId === behaviorId &&
      binding.param1 === param1 &&
      binding.param2 === param2
    ) {
      return;
    }

    if (!metadata) {
      console.error(
        "Can't find metadata for the selected behaviorId",
        behaviorId
      );
      return;
    }

    const isValid = validateBinding(
      metadata,
      layers.map(({ id }) => id),
      param1,
      param2
    );

    if (isValid) {
      onBindingChanged({
        behaviorId,
        param1: param1 || 0,
        param2: param2 || 0,
      });
    } else {
      console.warn(
        "Binding validation failed for behavior:",
        behaviors.find((b) => b.id === behaviorId)?.displayName,
        "param1:",
        param1,
        "param2:",
        param2,
        "metadata:",
        metadata,
        "metadata details:",
        JSON.stringify(metadata, null, 2)
      );

      // For Mouse Key Press and similar behaviors, try setting default param1 value
      const behaviorName = behaviors.find((b) => b.id === behaviorId)?.displayName;
      if (behaviorName === "Mouse Key Press" && param1 === 0) {
        console.log("Setting default param1=1 for Mouse Key Press");
        setParam1(1);
      }
    }
  }, [behaviorId, param1, param2]);

  useEffect(() => {
    setBehaviorId(binding.behaviorId);
    setParam1(binding.param1);
    setParam2(binding.param2);
  }, [binding]);

  return (
    <div className="flex flex-col gap-2">
      <div>
        <label>Behavior: </label>
        <select
          value={behaviorId}
          className="h-8 rounded"
          onChange={(e) => {
            const newBehaviorId = parseInt(e.target.value);
            const newBehavior = behaviors.find((b) => b.id === newBehaviorId);
            setBehaviorId(newBehaviorId);

            // Set default values for specific behaviors
            if (newBehavior?.displayName === "Mouse Key Press" ||
                newBehavior?.displayName === "Mouse Button") {
              setParam1(1); // Default to button 1 (left click)
              setParam2(0);
            } else if (newBehavior?.displayName === "Layer Tap" ||
                       newBehavior?.displayName === "Layer-Tap") {
              setParam1(1); // Default to layer 1
              setParam2(0x2C); // Default to Space key (HID usage 0x2C)
            } else {
              setParam1(0);
              setParam2(0);
            }
          }}
        >
          {sortedBehaviors.map((b) => (
            <option key={b.id} value={b.id}>
              {b.displayName}
            </option>
          ))}
        </select>
      </div>
      {metadata && (
        <BehaviorParametersPicker
          metadata={metadata}
          param1={param1}
          param2={param2}
          layers={layers}
          onParam1Changed={setParam1}
          onParam2Changed={setParam2}
        />
      )}
    </div>
  );
};
