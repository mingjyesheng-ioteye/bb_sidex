import { Disposable, toDisposable, type IDisposable } from '../../../base/common/lifecycle';
import type { IFileService } from '../../../platform/files/common/files';
import type { SidebarPart } from '../../browser/parts/sidebar/sidebarPart';
import type { EditorPart } from '../../browser/parts/editor/editorPart';

export class FileExplorer extends Disposable {
  private _contextMenu: HTMLElement | null = null;
  private readonly _subscriptions: IDisposable[] = [];

  constructor(
    private readonly _fileService: IFileService,
    private readonly _sidebar: SidebarPart,
    private readonly _editorPart: EditorPart,
  ) {
    super();
    this._setup();
  }

  private _setup(): void {
    this._subscriptions.push(
      this._sidebar.onDidSelectFile((path) => {
        this._editorPart.openFile(path);
      }),
    );

    this._subscriptions.push(
      this._sidebar.onDidRequestContextMenu(({ path, isDirectory, x, y }) => {
        this._showContextMenu(path, isDirectory, x, y);
      }),
    );

    document.addEventListener('click', () => this._hideContextMenu());
    document.addEventListener('contextmenu', () => this._hideContextMenu());
  }

  private _showContextMenu(path: string, isDirectory: boolean, x: number, y: number): void {
    this._hideContextMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    if (isDirectory) {
      menu.appendChild(this._menuItem('New File', () => this._promptNewFile(path)));
      menu.appendChild(this._menuItem('New Folder', () => this._promptNewFolder(path)));
      menu.appendChild(this._separator());
    }

    menu.appendChild(this._menuItem('Rename', () => this._promptRename(path)));
    menu.appendChild(this._menuItem('Delete', () => this._delete(path, isDirectory)));

    if (!isDirectory) {
      menu.appendChild(this._separator());
      menu.appendChild(this._menuItem('Copy Path', () => this._copyPath(path)));
    }

    // Clamp to viewport
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${window.innerWidth - rect.width - 4}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${window.innerHeight - rect.height - 4}px`;
    }

    this._contextMenu = menu;
  }

  private _hideContextMenu(): void {
    if (this._contextMenu) {
      this._contextMenu.remove();
      this._contextMenu = null;
    }
  }

  private _menuItem(label: string, action: () => void): HTMLElement {
    const item = document.createElement('div');
    item.className = 'context-menu-item';
    item.textContent = label;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      this._hideContextMenu();
      action();
    });
    return item;
  }

  private _separator(): HTMLElement {
    const sep = document.createElement('div');
    sep.className = 'context-menu-separator';
    return sep;
  }

  private async _promptNewFile(dirPath: string): Promise<void> {
    const name = prompt('New file name:');
    if (!name) return;
    const newPath = dirPath.endsWith('/') ? dirPath + name : dirPath + '/' + name;
    try {
      await this._fileService.write(newPath, '');
      await this._sidebar.refresh();
      await this._editorPart.openFile(newPath);
    } catch (err) {
      console.error('Failed to create file:', err);
    }
  }

  private async _promptNewFolder(dirPath: string): Promise<void> {
    const name = prompt('New folder name:');
    if (!name) return;
    const newPath = dirPath.endsWith('/') ? dirPath + name : dirPath + '/' + name;
    try {
      await this._fileService.mkdir(newPath);
      await this._sidebar.refresh();
    } catch (err) {
      console.error('Failed to create folder:', err);
    }
  }

  private async _promptRename(path: string): Promise<void> {
    const oldName = path.split(/[/\\]/).pop() ?? '';
    const newName = prompt('Rename to:', oldName);
    if (!newName || newName === oldName) return;

    const parentDir = path.substring(0, path.length - oldName.length);
    const newPath = parentDir + newName;

    try {
      await this._fileService.rename(path, newPath);
      await this._sidebar.refresh();
    } catch (err) {
      console.error('Failed to rename:', err);
    }
  }

  private async _delete(path: string, isDirectory: boolean): Promise<void> {
    const name = path.split(/[/\\]/).pop() ?? path;
    if (!confirm(`Delete "${name}"?`)) return;

    try {
      await this._fileService.delete(path, isDirectory);
      await this._sidebar.refresh();
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  }

  private async _copyPath(path: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(path);
    } catch {
      // Fallback: try tauri clipboard
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
      await writeText(path);
    }
  }

  override dispose(): void {
    this._hideContextMenu();
    for (const sub of this._subscriptions) {
      sub.dispose();
    }
    super.dispose();
  }
}
