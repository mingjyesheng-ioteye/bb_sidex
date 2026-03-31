import {
  readDir,
  readTextFile,
  writeTextFile,
  stat as fsStat,
  mkdir as fsMkdir,
  remove,
  rename as fsRename,
  exists as fsExists,
  type DirEntry,
} from '@tauri-apps/plugin-fs';
import { Disposable, DisposableStore, toDisposable, type IDisposable } from '../../../base/common/lifecycle';
import { Emitter, type Event } from '../../../base/common/event';
import {
  type IFileService,
  type IFileStat,
  type IFileContent,
  type IFileChange,
  type IFileWriteOptions,
  type ISearchResult,
  type ISearchMatch,
  FileChangeType,
} from '../common/files';
import { getTauriIPCBridge } from '../../../base/parts/ipc/common/ipc.tauri';

function toFileStat(entry: DirEntry, parentPath: string): IFileStat {
  const fullPath = parentPath.endsWith('/') || parentPath.endsWith('\\')
    ? parentPath + entry.name
    : parentPath + '/' + entry.name;
  return {
    name: entry.name,
    path: fullPath,
    isFile: !entry.isDirectory,
    isDirectory: entry.isDirectory ?? false,
    isSymbolicLink: entry.isSymlink ?? false,
    size: 0,
    mtime: 0,
  };
}

export class FileService extends Disposable implements IFileService {
  readonly serviceBrand: undefined;

  private readonly _onDidFilesChange = new Emitter<IFileChange[]>();
  readonly onDidFilesChange: Event<IFileChange[]> = this._onDidFilesChange.event;

  private readonly _watchDisposables = new DisposableStore();

  constructor() {
    super();
    this._initWatcher();
  }

  private async _initWatcher(): Promise<void> {
    const ipc = getTauriIPCBridge();
    try {
      const sub = await ipc.on('fs:change', (payload) => {
        const changes = payload as IFileChange[];
        this._onDidFilesChange.fire(changes);
      });
      this._watchDisposables.add(sub);
    } catch {
      // Rust backend may not have watcher yet
    }
  }

  async read(path: string): Promise<IFileContent> {
    const value = await readTextFile(path);
    let s: { size: number; mtime: number | null } | undefined;
    try {
      const info = await fsStat(path);
      s = { size: info.size, mtime: info.mtime ? new Date(info.mtime).getTime() : Date.now() };
    } catch {
      s = { size: value.length, mtime: Date.now() };
    }
    return {
      path,
      value,
      encoding: 'utf-8',
      mtime: s.mtime ?? Date.now(),
      size: s.size,
    };
  }

  async write(path: string, content: string, _options?: IFileWriteOptions): Promise<void> {
    await writeTextFile(path, content);
  }

  async stat(path: string): Promise<IFileStat> {
    const info = await fsStat(path);
    const name = path.split(/[/\\]/).filter(Boolean).pop() ?? path;
    return {
      name,
      path,
      isFile: info.isFile,
      isDirectory: info.isDirectory,
      isSymbolicLink: info.isSymlink,
      size: info.size,
      mtime: info.mtime ? new Date(info.mtime).getTime() : Date.now(),
    };
  }

  async readdir(path: string): Promise<IFileStat[]> {
    const entries = await readDir(path);
    return entries.map((e) => toFileStat(e, path));
  }

  async mkdir(path: string): Promise<void> {
    await fsMkdir(path, { recursive: true });
  }

  async delete(path: string, recursive = false): Promise<void> {
    await remove(path, { recursive });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await fsRename(oldPath, newPath);
  }

  async exists(path: string): Promise<boolean> {
    return fsExists(path);
  }

  watch(path: string): IDisposable {
    const ipc = getTauriIPCBridge();
    ipc.invoke('watch_path', { path }).catch(() => {});
    return toDisposable(() => {
      ipc.invoke('unwatch_path', { path }).catch(() => {});
    });
  }

  async search(rootPath: string, query: string): Promise<ISearchResult[]> {
    if (!query.trim()) return [];

    const results: ISearchResult[] = [];
    const searchQueue: string[] = [rootPath];
    const maxResults = 200;
    let totalMatches = 0;

    while (searchQueue.length > 0 && totalMatches < maxResults) {
      const dir = searchQueue.shift()!;
      let entries: IFileStat[];
      try {
        entries = await this.readdir(dir);
      } catch {
        continue;
      }

      entries.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      for (const entry of entries) {
        if (totalMatches >= maxResults) break;

        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'target') {
          continue;
        }

        if (entry.isDirectory) {
          searchQueue.push(entry.path);
        } else if (entry.isFile) {
          try {
            const content = await readTextFile(entry.path);
            const lines = content.split('\n');
            const matches: ISearchMatch[] = [];
            const lowerQuery = query.toLowerCase();

            for (let i = 0; i < lines.length && matches.length < 20; i++) {
              const lowerLine = lines[i].toLowerCase();
              let startIdx = 0;
              while (true) {
                const idx = lowerLine.indexOf(lowerQuery, startIdx);
                if (idx === -1) break;
                matches.push({
                  lineNumber: i + 1,
                  lineContent: lines[i],
                  matchStart: idx,
                  matchEnd: idx + query.length,
                });
                startIdx = idx + 1;
                totalMatches++;
                if (totalMatches >= maxResults) break;
              }
            }

            if (matches.length > 0) {
              results.push({ path: entry.path, matches });
            }
          } catch {
            // Binary or unreadable file
          }
        }
      }
    }

    return results;
  }

  override dispose(): void {
    this._watchDisposables.dispose();
    this._onDidFilesChange.dispose();
    super.dispose();
  }
}
