import { AppHeader } from "./AppHeader";

import { create_rpc_connection } from "@zmkfirmware/zmk-studio-ts-client";
import { call_rpc } from "./rpc/logging";

import type { Notification } from "@zmkfirmware/zmk-studio-ts-client/studio";
import { ConnectionState, ConnectionContext } from "./rpc/ConnectionContext";
import {
  ChangeEvent,
  Dispatch,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConnectModal, TransportFactory } from "./ConnectModal";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { connect as gatt_connect } from "@zmkfirmware/zmk-studio-ts-client/transport/gatt";
import { connect as serial_connect } from "@zmkfirmware/zmk-studio-ts-client/transport/serial";
import {
  connect as tauri_ble_connect,
  list_devices as ble_list_devices,
} from "./tauri/ble";
import {
  connect as tauri_serial_connect,
  list_devices as serial_list_devices,
} from "./tauri/serial";
import Keyboard, { KeyboardHandle } from "./keyboard/Keyboard";
import { UndoRedoContext, useUndoRedo } from "./undoRedo";
import { usePub, useSub } from "./usePubSub";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { LockStateContext } from "./rpc/LockStateContext";
import { UnlockModal } from "./UnlockModal";
import { valueAfter } from "./misc/async";
import { AppFooter } from "./AppFooter";
import { AboutModal } from "./AboutModal";
import { LicenseNoticeModal } from "./misc/LicenseNoticeModal";
import {
  ComboConfig,
  PointingConfig,
  StudioSaveFile,
  createDefaultPointingConfig,
  isStudioSaveFile,
} from "./saveFormat";

const clonePointingConfig = (config: PointingConfig): PointingConfig =>
  JSON.parse(JSON.stringify(config));

const pointingConfigsEqual = (
  a: PointingConfig,
  b: PointingConfig
): boolean => JSON.stringify(a) === JSON.stringify(b);

declare global {
  interface Window {
    __TAURI_INTERNALS__?: object;
  }
}

const TRANSPORTS: TransportFactory[] = [
  navigator.serial && { label: "USB", connect: serial_connect },
  ...(navigator.bluetooth && navigator.userAgent.indexOf("Linux") >= 0
    ? [{ label: "BLE", connect: gatt_connect }]
    : []),
  ...(window.__TAURI_INTERNALS__
    ? [
        {
          label: "BLE",
          isWireless: true,
          pick_and_connect: {
            connect: tauri_ble_connect,
            list: ble_list_devices,
          },
        },
      ]
    : []),
  ...(window.__TAURI_INTERNALS__
    ? [
        {
          label: "USB",
          pick_and_connect: {
            connect: tauri_serial_connect,
            list: serial_list_devices,
          },
        },
      ]
    : []),
].filter((t) => t !== undefined);

async function listen_for_notifications(
  notification_stream: ReadableStream<Notification>,
  signal: AbortSignal
): Promise<void> {
  let reader = notification_stream.getReader();
  const onAbort = () => {
    reader.cancel();
    reader.releaseLock();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  do {
    let pub = usePub();

    try {
      let { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      console.log("Notification", value);
      pub("rpc_notification", value);

      const subsystem = Object.entries(value).find(
        ([_k, v]) => v !== undefined
      );
      if (!subsystem) {
        continue;
      }

      const [subId, subData] = subsystem;
      const event = Object.entries(subData).find(([_k, v]) => v !== undefined);

      if (!event) {
        continue;
      }

      const [eventName, eventData] = event;
      const topic = ["rpc_notification", subId, eventName].join(".");

      pub(topic, eventData);
    } catch (e) {
      signal.removeEventListener("abort", onAbort);
      reader.releaseLock();
      throw e;
    }
  } while (true);

  signal.removeEventListener("abort", onAbort);
  reader.releaseLock();
  notification_stream.cancel();
}

async function connect(
  transport: RpcTransport,
  setConn: Dispatch<ConnectionState>,
  setConnectedDeviceName: Dispatch<string | undefined>,
  signal: AbortSignal
) {
  let conn = await create_rpc_connection(transport, { signal });

  let details = await Promise.race([
    call_rpc(conn, { core: { getDeviceInfo: true } })
      .then((r) => r?.core?.getDeviceInfo)
      .catch((e) => {
        console.error("Failed first RPC call", e);
        return undefined;
      }),
    valueAfter(undefined, 1000),
  ]);

  if (!details) {
    // TODO: Show a proper toast/alert not using `window.alert`
    window.alert("Failed to connect to the chosen device");
    return;
  }

  listen_for_notifications(conn.notification_readable, signal)
    .then(() => {
      setConnectedDeviceName(undefined);
      setConn({ conn: null });
    })
    .catch((_e) => {
      setConnectedDeviceName(undefined);
      setConn({ conn: null });
    });

  setConnectedDeviceName(details.name);
  setConn({ conn });
}

function App() {
  const [conn, setConn] = useState<ConnectionState>({ conn: null });
  const [connectedDeviceName, setConnectedDeviceName] = useState<
    string | undefined
  >(undefined);
  const [doIt, undo, redo, canUndo, canRedo, reset] = useUndoRedo();
  const [showAbout, setShowAbout] = useState(false);
  const [showLicenseNotice, setShowLicenseNotice] = useState(false);
  const [connectionAbort, setConnectionAbort] = useState(new AbortController());
  const [keymapAvailable, setKeymapAvailable] = useState(false);
  const keyboardRef = useRef<KeyboardHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [combos, setCombos] = useState<ComboConfig[]>([]);
  const [pointingConfig, setPointingConfig] = useState<PointingConfig>(() =>
    createDefaultPointingConfig()
  );
  const [pointingBaseline, setPointingBaseline] = useState<PointingConfig>(() =>
    createDefaultPointingConfig()
  );
  const [pointingUnsupportedNotified, setPointingUnsupportedNotified] =
    useState(false);
  const hasPointingChanges = useMemo(
    () => !pointingConfigsEqual(pointingConfig, pointingBaseline),
    [pointingConfig, pointingBaseline]
  );

  const [lockState, setLockState] = useState<LockState>(
    LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED
  );

  useSub("rpc_notification.core.lockStateChanged", (ls) => {
    setLockState(ls);
  });

  useEffect(() => {
    async function updateLockState() {
      if (!conn.conn) {
        return;
      }

      let locked_resp = await call_rpc(conn.conn, {
        core: { getLockState: true },
      });

      setLockState(
        locked_resp.core?.getLockState ||
          LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED
      );
    }

    updateLockState();
  }, [conn, setLockState]);

  useEffect(() => {
    if (!conn.conn) {
      reset();
      setLockState(LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED);
    }
    setPointingUnsupportedNotified(false);
  }, [conn.conn, reset, setLockState]);

  const sendPointingSensitivity = useCallback(async (): Promise<
    "success" | "unsupported" | "failed"
  > => {
    if (!conn.conn) {
      return "failed";
    }

    const payload = {
      pointing: {
        setSensitivity: {
          cursor: {
            numerator: pointingConfig.cursor.scale[0],
            denominator: pointingConfig.cursor.scale[1],
          },
          scroll: pointingConfig.scroll
            ? {
                numerator: pointingConfig.scroll.scale[0],
                denominator: pointingConfig.scroll.scale[1],
              }
            : undefined,
          cpi:
            pointingConfig.cursor.cpi === null ||
            pointingConfig.cursor.cpi === undefined
              ? undefined
              : pointingConfig.cursor.cpi,
        },
      },
    };

    try {
      const resp = await call_rpc(conn.conn, payload as any);
      const result = (resp as any)?.pointing?.setSensitivity;
      if (result?.err !== undefined && result?.err !== null) {
        const errValue = result.err;
        if (
          errValue === 1 ||
          errValue === "SET_SENSITIVITY_ERR_UNSUPPORTED" ||
          errValue === "unsupported"
        ) {
          return "unsupported";
        }
        console.error("Failed to apply trackball sensitivity", result);
        return "failed";
      }
      return "success";
    } catch (error) {
      const message =
        error instanceof Error ? error.message.toLowerCase() : String(error);
      if (
        message.includes("pointing") ||
        message.includes("unrecognized") ||
        message.includes("unknown") ||
        message.includes("unsupported")
      ) {
        console.warn(
          "Connected firmware does not support trackball sensitivity RPC",
          error
        );
        return "unsupported";
      }
      console.error("Failed to send trackball sensitivity update", error);
      return "failed";
    }
  }, [conn, pointingConfig]);

  const save = useCallback(async () => {
    let sensitivityStatus: "success" | "unsupported" | "failed" = "success";
    if (hasPointingChanges) {
      sensitivityStatus = await sendPointingSensitivity();
      if (sensitivityStatus === "failed") {
        window.alert(
          "Failed to apply trackball sensitivity settings. Keymap changes were still sent, but sensitivity values were not updated."
        );
      } else if (sensitivityStatus === "unsupported") {
        if (!pointingUnsupportedNotified) {
          window.alert(
            "Connected firmware does not support trackball sensitivity updates yet. Update the firmware to apply these values."
          );
          setPointingUnsupportedNotified(true);
        }
      }
      if (sensitivityStatus === "success" || sensitivityStatus === "unsupported") {
        setPointingBaseline(clonePointingConfig(pointingConfig));
      }
    }

    if (!conn.conn) {
      return;
    }

    const resp = await call_rpc(conn.conn, { keymap: { saveChanges: true } });
    if (!resp.keymap?.saveChanges || resp.keymap?.saveChanges.err) {
      console.error("Failed to save changes", resp.keymap?.saveChanges);
    }
  }, [
    conn,
    hasPointingChanges,
    pointingConfig,
    pointingUnsupportedNotified,
    sendPointingSensitivity,
  ]);

  const discard = useCallback(() => {
    async function doDiscard() {
      if (!conn.conn) {
        return;
      }

      let resp = await call_rpc(conn.conn, {
        keymap: { discardChanges: true },
      });
      if (!resp.keymap?.discardChanges) {
        console.error("Failed to discard changes", resp);
      }

      reset();
      setPointingConfig(clonePointingConfig(pointingBaseline));
      setConn({ conn: conn.conn });
    }

    doDiscard();
  }, [conn, pointingBaseline]);

  const resetSettings = useCallback(() => {
    async function doReset() {
      if (!conn.conn) {
        return;
      }

      let resp = await call_rpc(conn.conn, {
        core: { resetSettings: true },
      });
      if (!resp.core?.resetSettings) {
        console.error("Failed to settings reset", resp);
      }

      reset();
      setConn({ conn: conn.conn });
    }

    doReset();
  }, [conn]);

  const disconnect = useCallback(() => {
    async function doDisconnect() {
      if (!conn.conn) {
        return;
      }

      await conn.conn.request_writable.close();
      connectionAbort.abort("User disconnected");
      setConnectionAbort(new AbortController());
    }

    doDisconnect();
  }, [conn]);

  const onConnect = useCallback(
    (t: RpcTransport) => {
      const ac = new AbortController();
      setConnectionAbort(ac);
      connect(t, setConn, setConnectedDeviceName, ac.signal);
    },
    [setConn, setConnectedDeviceName, setConnectedDeviceName]
  );

  const exportKeymapToFile = useCallback(() => {
    const current = keyboardRef.current?.getCurrentKeymap();
    if (!current) {
      window.alert("No keymap loaded to save.");
      return;
    }
    const payload: StudioSaveFile = {
      keymap: current,
      combos,
      pointing: pointingConfig,
    };
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const normalizedName =
      connectedDeviceName?.replace(/\s+/g, "-").toLowerCase() || "keymap";
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${normalizedName}-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [connectedDeviceName, combos, pointingConfig]);

  const handleFileSelection = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      try {
        const content = await file.text();
        const parsed = JSON.parse(content);
        const saveFile = isStudioSaveFile(parsed) ? parsed : undefined;
        const keymapToLoad = saveFile ? saveFile.keymap : parsed;
        await keyboardRef.current?.importKeymap(keymapToLoad);
        if (saveFile) {
          setCombos(saveFile.combos ?? []);
          if (saveFile.pointing) {
            const cloned = clonePointingConfig(saveFile.pointing);
            setPointingConfig(cloned);
            setPointingBaseline(cloned);
          } else {
            const defaults = createDefaultPointingConfig();
            setPointingConfig(defaults);
            setPointingBaseline(clonePointingConfig(defaults));
          }
        } else {
          setCombos([]);
          const defaults = createDefaultPointingConfig();
          setPointingConfig(defaults);
          setPointingBaseline(clonePointingConfig(defaults));
        }
        reset();
      } catch (error) {
        console.error("Failed to load keymap", error);
        window.alert(
          error instanceof Error
            ? `Failed to load keymap: ${error.message}`
            : "Failed to load keymap."
        );
      } finally {
        event.target.value = "";
      }
    },
    [reset]
  );

  const triggerImport = useCallback(() => {
    if (!conn.conn) {
      window.alert("Connect to a device before loading a keymap.");
      return;
    }

    fileInputRef.current?.click();
  }, [conn]);

  return (
    <ConnectionContext.Provider value={conn}>
      <LockStateContext.Provider value={lockState}>
        <UndoRedoContext.Provider value={doIt}>
          <UnlockModal />
          <ConnectModal
            open={!conn.conn}
            transports={TRANSPORTS}
            onTransportCreated={onConnect}
          />
          <AboutModal open={showAbout} onClose={() => setShowAbout(false)} />
          <LicenseNoticeModal
            open={showLicenseNotice}
            onClose={() => setShowLicenseNotice(false)}
          />
          <div className="bg-base-100 text-base-content h-full max-h-[100vh] w-full max-w-[100vw] inline-grid grid-cols-[auto] grid-rows-[auto_1fr_auto] overflow-hidden">
            <AppHeader
              connectedDeviceLabel={connectedDeviceName}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={undo}
              onRedo={redo}
              onSave={save}
              onDiscard={discard}
              onDisconnect={disconnect}
              onResetSettings={resetSettings}
              onExportKeymap={exportKeymapToFile}
              onImportKeymap={triggerImport}
              canExportKeymap={keymapAvailable}
              canImportKeymap={!!conn.conn}
              hasLocalChanges={hasPointingChanges}
            />
            <Keyboard
              ref={keyboardRef}
              onKeymapAvailabilityChange={setKeymapAvailable}
              pointingConfig={pointingConfig}
              onPointingConfigChange={setPointingConfig}
            />
            <AppFooter
              onShowAbout={() => setShowAbout(true)}
              onShowLicenseNotice={() => setShowLicenseNotice(true)}
            />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleFileSelection}
          />
        </UndoRedoContext.Provider>
      </LockStateContext.Provider>
    </ConnectionContext.Provider>
  );
}

export default App;
