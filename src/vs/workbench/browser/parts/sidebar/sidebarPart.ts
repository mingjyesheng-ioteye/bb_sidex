import { Disposable } from '../../../../base/common/lifecycle';
import { Emitter, type Event } from '../../../../base/common/event';
import type { IFileService, IFileStat } from '../../../../platform/files/common/files';

export class SidebarPart extends Disposable {
  private readonly _sidebar: HTMLElement;
  private readonly _content: HTMLElement;
  private readonly _header: HTMLElement;
  private _rootPath: string | null = null;
  private _selectedPath: string | null = null;

  private readonly _onDidSelectFile = new Emitter<string>();
  readonly onDidSelectFile: Event<string> = this._onDidSelectFile.event;

  private readonly _onDidRequestContextMenu = new Emitter<{ path: string; isDirectory: boolean; x: number; y: number }>();
  readonly onDidRequestContextMenu: Event<{ path: string; isDirectory: boolean; x: number; y: number }> = this._onDidRequestContextMenu.event;

  constructor(
    private readonly _fileService: IFileService,
  ) {
    super();
    this._sidebar = document.getElementById('sidebar')!;
    this._content = document.getElementById('sidebar-content')!;
    this._header = document.getElementById('sidebar-header')!;
  }

  get rootPath(): string | null {
    return this._rootPath;
  }

  async openFolder(path: string): Promise<void> {
    this._rootPath = path;
    const folderName = path.split(/[/\\]/).filter(Boolean).pop() ?? path;
    this._header.querySelector('h3')!.textContent = folderName.toUpperCase();
    this._content.innerHTML = '';

    const treeView = document.createElement('div');
    treeView.className = 'tree-view';
    this._content.appendChild(treeView);

    await this._renderDirectory(path, treeView, 0);
  }

  private async _renderDirectory(path: string, container: HTMLElement, depth: number): Promise<void> {
    let entries: IFileStat[];
    try {
      entries = await this._fileService.readdir(path);
    } catch (err) {
      console.error('Failed to read directory:', err);
      return;
    }

    // Sort: folders first, then alphabetical
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    // Filter hidden files
    entries = entries.filter((e) => !e.name.startsWith('.'));

    for (const entry of entries) {
      this._renderEntry(entry, container, depth);
    }
  }

  private _renderEntry(entry: IFileStat, container: HTMLElement, depth: number): void {
    const item = document.createElement('div');
    item.className = 'tree-item' + (entry.isDirectory ? ' folder' : ' file');
    item.dataset.path = entry.path;
    item.style.setProperty('--indent', `${8 + depth * 16}px`);

    if (entry.isDirectory) {
      const chevron = document.createElement('span');
      chevron.className = 'tree-chevron';
      chevron.textContent = '▶';
      item.appendChild(chevron);

      const icon = document.createElement('span');
      icon.className = 'tree-icon';
      icon.textContent = '📁';
      item.appendChild(icon);

      const label = document.createElement('span');
      label.className = 'tree-label';
      label.textContent = entry.name;
      item.appendChild(label);

      const childContainer = document.createElement('div');
      childContainer.className = 'tree-children';
      let loaded = false;

      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        const isExpanded = childContainer.classList.contains('expanded');

        if (isExpanded) {
          childContainer.classList.remove('expanded');
          chevron.classList.remove('expanded');
          icon.textContent = '📁';
        } else {
          if (!loaded) {
            loaded = true;
            await this._renderDirectory(entry.path, childContainer, depth + 1);
          }
          childContainer.classList.add('expanded');
          chevron.classList.add('expanded');
          icon.textContent = '📂';
        }
      });

      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._onDidRequestContextMenu.fire({
          path: entry.path,
          isDirectory: true,
          x: e.clientX,
          y: e.clientY,
        });
      });

      container.appendChild(item);
      container.appendChild(childContainer);
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'tree-chevron';
      spacer.textContent = '';
      item.appendChild(spacer);

      const icon = document.createElement('span');
      icon.className = 'tree-icon';
      icon.textContent = this._getFileIcon(entry.name);
      item.appendChild(icon);

      const label = document.createElement('span');
      label.className = 'tree-label';
      label.textContent = entry.name;
      item.appendChild(label);

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this._selectItem(item, entry.path);
        this._onDidSelectFile.fire(entry.path);
      });

      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._onDidRequestContextMenu.fire({
          path: entry.path,
          isDirectory: false,
          x: e.clientX,
          y: e.clientY,
        });
      });

      container.appendChild(item);
    }
  }

  private _selectItem(element: HTMLElement, path: string): void {
    this._content.querySelectorAll('.tree-item.selected').forEach((el) => el.classList.remove('selected'));
    element.classList.add('selected');
    this._selectedPath = path;
  }

  private _getFileIcon(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const icons: Record<string, string> = {
      ts: '🟦', tsx: '⚛️', js: '🟨', jsx: '⚛️', json: '📋',
      html: '🌐', css: '🎨', md: '📝', py: '🐍', rs: '🦀',
      go: '🔵', java: '☕', toml: '⚙️', yaml: '⚙️', yml: '⚙️',
      sh: '📜', sql: '🗄️', svg: '🖼️', xml: '📄', txt: '📄',
      lock: '🔒', gitignore: '🙈',
    };
    return icons[ext] || '📄';
  }

  async refresh(): Promise<void> {
    if (this._rootPath) {
      await this.openFolder(this._rootPath);
    }
  }

  show(): void {
    this._sidebar.classList.remove('hidden');
  }

  hide(): void {
    this._sidebar.classList.add('hidden');
  }

  toggle(): void {
    this._sidebar.classList.toggle('hidden');
  }

  setView(viewId: string): void {
    this._header.querySelector('h3')!.textContent = viewId.toUpperCase();
  }

  override dispose(): void {
    this._onDidSelectFile.dispose();
    this._onDidRequestContextMenu.dispose();
    super.dispose();
  }
}
