# conductor studio プロジェクト概要

> ZMK Studio から派生したフォークです。

## プロジェクトの目的
- ZMK Firmware デバイスと接続し、キーマップやレイアウトを GUI で操作できるクロスプラットフォームアプリケーション。
- Web (Vite + React) と デスクトップ (Tauri) の両方で動作し、USB/BLE 経由でデバイスと双方向通信を行う。

## フロントエンド構成
- React 18・TypeScript・Tailwind CSS を採用し、`src/` 以下に UI ロジックを実装。
- `App.tsx` がエントリーポイントで、接続状態 (`ConnectionContext`) やロック状態 (`LockStateContext`) を Context で共有。
- 通知ストリームを `usePubSub` でアプリ全体に配信し、キーマップや動作一覧をリアルタイム更新。
- `Keyboard` コンポーネントはキーマップ編集の中心で、物理レイアウト切り替え、レイヤー選択、キーごとのビヘイビア編集、Undo/Redo (`UndoRedoContext`) を提供。
- `ConnectModal` や `UnlockModal` などのモーダルで、接続デバイス選択やロック解除を対話的に実装。
- `DownloadPage` は `scripts/generate-release-data.js` で生成される最新リリース情報を読み込み、プラットフォーム別インストーラを案内するスタンドアロンビュー。

## RPC・通信レイヤー
- デバイス通信は `@zmkfirmware/zmk-studio-ts-client` の RPC API を使用。USB/BLE トランスポートを選択し `create_rpc_connection` で接続。
- ブラウザ版は Web Serial / Web Bluetooth を直接利用、デスクトップ版は Tauri 側の pick-and-connect API 経由で同等機能を提供。
- `src/rpc/` では RPC 呼び出しをラップし、接続中のみデータ取得を許可する Safeguard を実装。

## Tauri (デスクトップ) 側
- `src-tauri/` 以下は Rust 製 Tauri アプリ。`main.rs` で CLI プラグインと独自 IPC コマンドを登録。
- `transport` モジュールでシリアル/BLE デバイス列挙と接続 (`serial.rs`, `gatt.rs`)、IPC 経由のデータ送受信 (`commands.rs`) を担当。
- デスクトップ環境ではフロントエンドから Tauri コマンドを呼び出し、USB/BLE デバイスを選択して `RpcTransport` を生成する。

## ビルド・開発ワークフロー
- 主要スクリプト: `npm run dev` (開発サーバ + リリースデータ生成), `npm run build` (型チェック + Vite ビルド), `npm run tauri` (Tauri コマンド), `npm run storybook`。
- 初回は `npm install` を実行。最新リリース情報が必要な場合は `GITHUB_TOKEN` を設定して `npm run generate-data` を実行。
- フロントエンドの静的アセットは `public/` に配置。`tailwind.config.js` と `postcss.config.js` でスタイル設定を管理。

## ディレクトリハイライト
- `src/` … React UI、RPC ヘルパー、モーダル、キーマップ関連ロジック、スタイル。
- `src-tauri/` … Rust/Tauri 実装。デスクトップ版でのデバイス検出・通信を担当。
- `scripts/` … 補助スクリプト (GitHub Releases からデータを取得)。
- `public/` … 画像やフォントなどのパブリックアセット。
- `requirements.txt` … `pre-commit` などの開発支援 Python ツールを管理。

## 依存関係のポイント
- UI: `react`, `react-aria-components`, `lucide-react`, `tailwindcss-react-aria-components` など。
- RPC/通信: `@zmkfirmware/zmk-studio-ts-client`, `@tauri-apps/api`, `@tauri-apps/plugin-cli`。
- ビルド: `vite`, `@vitejs/plugin-react-swc`, `typescript`, `eslint`, `storybook`。

## 補足
- 通知やキーマップ更新は非同期処理が多いため、`useEffect` 内でキャンセル制御や `AbortSignal` を多用している。
- Undo/Redo はカスタムスタックで管理され、操作ごとに RPC コールとローカル状態を同期。
- Web 版ではブラウザ機能制限により一部トランスポートが利用できないケースがあるため、Tauri 版の pick-and-connect UI を用意している。
