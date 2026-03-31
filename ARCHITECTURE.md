# SideX — A Clean-Room Tauri Port of VSCode

## Project Overview

SideX is a clean-room rewrite of Visual Studio Code, replacing Electron with Tauri (Rust backend + native webview). The goal is full architectural parity with VSCode — same subsystem structure, same extension API surface, same user experience — but running on a lighter, faster, more secure native shell.

## Approach

Following the [Open Claw](https://github.com/instructkr/claw-code) methodology:
1. **Study** the VSCode architecture thoroughly
2. **Map** every subsystem, service, and API surface  
3. **Port** systematically, subsystem by subsystem
4. **Verify** parity at each checkpoint

No proprietary code is copied. This is architectural replication — the same approach used in clean-room reverse engineering.

## Architecture Mapping

### VSCode Process Model → SideX Process Model

```
VSCode (Electron)                    SideX (Tauri)
─────────────────                    ─────────────
Electron Main Process        →       Tauri Rust Backend
  ├─ BrowserWindow           →       WebviewWindow
  ├─ ipcMain                 →       Tauri Commands + Events
  ├─ Menu/Dialog/Shell       →       Tauri Plugins
  └─ UtilityProcess          →       Rust async tasks / sidecars

Renderer Process             →       Tauri Webview (frontend TS)
  ├─ Workbench               →       Workbench (same TS)
  ├─ Monaco Editor           →       Monaco Editor (same)
  └─ Extension Host API      →       Extension Host API (ported)

Shared Process               →       Rust service layer
Extension Host               →       Sidecar process / WASM
```

### VSCode Layering → SideX Layering

```
┌─────────────────────────────────────────────┐
│  code/        → Application entry (Tauri)   │
├─────────────────────────────────────────────┤
│  workbench/   → IDE shell (92 contrib, 90   │
│                 services, 8 visual Parts)    │
├─────────────────────────────────────────────┤
│  editor/      → Monaco text editor core     │
├─────────────────────────────────────────────┤
│  platform/    → 93 platform services (DI)   │
├─────────────────────────────────────────────┤
│  base/        → Foundation utilities        │
└─────────────────────────────────────────────┘
```

### Electron API → Tauri Replacement Map

| Electron API | Tauri Replacement | Status |
|---|---|---|
| `BrowserWindow` | `WebviewWindow` | planned |
| `ipcMain/ipcRenderer` | `invoke()` / `emit()` / `listen()` | planned |
| `Menu/MenuItem` | `tauri::menu::Menu` | planned |
| `dialog.*` | `@tauri-apps/plugin-dialog` | planned |
| `clipboard` | `@tauri-apps/plugin-clipboard-manager` | planned |
| `shell.openExternal` | `@tauri-apps/plugin-opener` | planned |
| `Notification` | `@tauri-apps/plugin-notification` | planned |
| `autoUpdater` | `@tauri-apps/plugin-updater` | planned |
| `safeStorage` | Rust keyring crate | planned |
| `protocol.*` | Tauri custom protocol | planned |
| `powerMonitor` | Rust system-info crates | planned |
| `contentTracing` | Rust tracing crate | planned |
| `screen/Display` | Tauri monitor API | planned |
| `contextBridge` | `@tauri-apps/api` (direct) | planned |
| `node-pty` | `portable-pty` (Rust) | planned |
| `@parcel/watcher` | `notify` (Rust) | planned |
| `native-keymap` | Rust keyboard crate | planned |
| `@vscode/spdlog` | `tracing` + `tracing-subscriber` | planned |
| `child_process` | `std::process::Command` | planned |
| `fs/fs.promises` | `@tauri-apps/plugin-fs` + Rust fs | planned |
| `net/http` | `reqwest` (Rust) | planned |
| `crypto` | `ring` / `sha2` (Rust) | planned |
| `os.*` | `sysinfo` (Rust) | planned |

## Repository Layout

```
sidex/
├── src/                              # TypeScript frontend (workbench)
│   ├── vs/
│   │   ├── base/                     # Foundation utilities
│   │   │   ├── common/               # Pure TS utilities
│   │   │   ├── browser/              # DOM utilities
│   │   │   └── parts/                # IPC, storage, sandbox
│   │   ├── platform/                 # Platform services (DI)
│   │   │   ├── files/                # File system service
│   │   │   ├── windows/              # Window management
│   │   │   ├── dialogs/              # Dialogs
│   │   │   ├── clipboard/            # Clipboard
│   │   │   ├── native/               # OS integration
│   │   │   ├── terminal/             # Terminal
│   │   │   ├── configuration/        # Settings
│   │   │   ├── storage/              # Storage
│   │   │   ├── commands/             # Command system
│   │   │   ├── keybinding/           # Keybindings
│   │   │   ├── contextkey/           # Context keys
│   │   │   ├── theme/                # Theming
│   │   │   ├── log/                  # Logging
│   │   │   ├── instantiation/        # DI container
│   │   │   └── ...                   # 93 services total
│   │   ├── editor/                   # Monaco editor core
│   │   │   ├── common/               # Editor model, languages
│   │   │   ├── browser/              # Editor widget, view
│   │   │   ├── contrib/              # 57 editor contributions
│   │   │   └── standalone/           # Standalone editor API
│   │   ├── workbench/                # IDE shell
│   │   │   ├── browser/              # Layout, Parts, boot
│   │   │   ├── common/               # Shared types
│   │   │   ├── contrib/              # 92 feature contributions
│   │   │   ├── services/             # 90 workbench services
│   │   │   └── api/                  # Extension host API
│   │   └── code/                     # Application entry
│   │       └── browser/              # Tauri-specific entry
│   └── main.ts                       # Frontend entry point
├── src-tauri/                        # Rust backend (Tauri)
│   ├── src/
│   │   ├── main.rs                   # Tauri app entry
│   │   ├── commands/                 # Tauri command handlers
│   │   │   ├── fs.rs                 # File system commands
│   │   │   ├── window.rs             # Window management
│   │   │   ├── dialog.rs             # Dialog commands
│   │   │   ├── terminal.rs           # PTY/terminal commands
│   │   │   ├── process.rs            # Process management
│   │   │   ├── os.rs                 # OS information
│   │   │   ├── clipboard.rs          # Clipboard commands
│   │   │   ├── crypto.rs             # Encryption/hashing
│   │   │   ├── shell.rs              # Shell integration
│   │   │   └── storage.rs            # Storage commands
│   │   ├── services/                 # Rust service layer
│   │   │   ├── file_watcher.rs       # File watching (notify)
│   │   │   ├── pty_host.rs           # Terminal PTY (portable-pty)
│   │   │   ├── extension_host.rs     # Extension host manager
│   │   │   ├── search.rs             # File/text search
│   │   │   └── git.rs                # Git integration
│   │   └── ipc/                      # IPC protocol layer
│   │       ├── channels.rs           # Channel definitions
│   │       ├── protocol.rs           # Message protocol
│   │       └── proxy.rs              # Service proxies
│   ├── Cargo.toml
│   └── tauri.conf.json
├── tests/                            # Verification tests
│   ├── subsystem_parity.test.ts      # Subsystem parity checks
│   ├── api_surface.test.ts           # API surface verification
│   └── integration.test.ts           # Integration tests
├── port_manifest.json                # Machine-readable port status
├── ARCHITECTURE.md                   # This file
└── README.md
```

## Subsystem Port Status

### Layer 1: base/ (Foundation)
| Subsystem | VSCode Files | SideX Status | Notes |
|---|---|---|---|
| base/common | ~200 | planned | Pure TS, can reuse directly |
| base/browser | ~150 | planned | DOM utilities, can reuse |
| base/parts/ipc | ~15 | planned | Rewrite for Tauri IPC |
| base/parts/storage | ~5 | planned | Rewrite for Tauri storage |
| base/parts/sandbox | ~5 | planned | Not needed (no Electron sandbox) |
| base/node | ~50 | planned | Replace with Tauri commands |
| base/worker | ~10 | planned | Web Workers, can reuse |

### Layer 2: platform/ (Services)
| Subsystem | VSCode Files | SideX Status | Notes |
|---|---|---|---|
| instantiation (DI) | ~20 | planned | Can reuse directly |
| files | ~30 | planned | Tauri fs plugin + Rust |
| windows | ~15 | planned | Tauri window API |
| configuration | ~20 | planned | Can mostly reuse |
| storage | ~15 | planned | Rust SQLite backend |
| keybinding | ~15 | planned | Can mostly reuse |
| commands | ~10 | planned | Can reuse directly |
| contextkey | ~10 | planned | Can reuse directly |
| theme | ~10 | planned | Can reuse directly |
| log | ~10 | planned | Rust tracing backend |
| terminal | ~20 | planned | Rust portable-pty |
| dialogs | ~5 | planned | Tauri dialog plugin |
| clipboard | ~5 | planned | Tauri clipboard plugin |
| native | ~10 | planned | Rust OS integration |
| encryption | ~5 | planned | Rust keyring |
| ... | ... | planned | 93 services total |

### Layer 3: editor/ (Monaco)
| Subsystem | VSCode Files | SideX Status | Notes |
|---|---|---|---|
| editor/common | ~200 | planned | Pure TS, reuse directly |
| editor/browser | ~100 | planned | DOM-based, reuse directly |
| editor/contrib | ~300 | planned | 57 contributions, reuse |
| editor/standalone | ~20 | planned | Standalone API, reuse |

### Layer 4: workbench/ (IDE Shell)
| Subsystem | VSCode Files | SideX Status | Notes |
|---|---|---|---|
| browser/layout | ~5 | planned | Grid layout, reuse |
| browser/parts | ~110 | planned | 8 Parts, reuse with mods |
| contrib (92 features) | ~2500 | planned | Incremental port |
| services (90 services) | ~650 | planned | Incremental port |
| api (ext host) | ~300 | planned | Extension API surface |

### Layer 5: code/ (Application Entry)
| Subsystem | VSCode Files | SideX Status | Notes |
|---|---|---|---|
| electron-main | ~20 | planned | FULL REWRITE → Tauri Rust |
| electron-browser | ~12 | planned | REWRITE → Tauri webview |
| node (CLI) | ~10 | planned | Rust CLI |

## Porting Priority Order

1. **base/common** + **base/browser** — Foundation (can reuse 90%+)
2. **platform/instantiation** — DI container (reuse directly)
3. **platform/** core services — files, config, commands, keybinding, theme
4. **editor/** — Monaco editor (reuse 95%+ as-is)
5. **src-tauri/** — Rust backend replacing Electron main process
6. **base/parts/ipc** — Tauri IPC bridge
7. **workbench/browser** — Layout + Parts
8. **workbench/services** — Workbench services
9. **workbench/contrib** — Features (incremental)
10. **workbench/api** — Extension host

## Build & Run

```bash
# Install dependencies
npm install

# Development
npm run tauri dev

# Build
npm run tauri build

# Run tests
npm test
```

## Credits

- Architectural study based on [Microsoft VSCode](https://github.com/microsoft/vscode) (MIT License)
- Porting methodology inspired by [Open Claw](https://github.com/instructkr/claw-code)
- Built with [Tauri](https://tauri.app/) and [Monaco Editor](https://microsoft.github.io/monaco-editor/)
