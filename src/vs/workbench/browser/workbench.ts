import { open } from '@tauri-apps/plugin-dialog';
import { Disposable, DisposableStore } from '../../base/common/lifecycle';
import { InstantiationService } from '../../platform/instantiation/common/instantiation';
import { FileService } from '../../platform/files/browser/fileService';
import { IFileService } from '../../platform/files/common/files';
import { EditorPart } from './parts/editor/editorPart';
import { SidebarPart } from './parts/sidebar/sidebarPart';
import { StatusbarPart } from './parts/statusbar/statusbarPart';
import { FileExplorer } from '../contrib/files/fileExplorer';
import { SearchView } from '../contrib/search/searchView';

interface ICommand {
  id: string;
  label: string;
  keybinding?: string;
  handler: () => void | Promise<void>;
}

export class Workbench extends Disposable {
  private readonly _store = new DisposableStore();
  private readonly _instantiation: InstantiationService;
  private _fileService!: FileService;
  private _editorPart!: EditorPart;
  private _sidebarPart!: SidebarPart;
  private _statusbarPart!: StatusbarPart;
  private _fileExplorer!: FileExplorer;
  private _searchView!: SearchView;

  private _commands: ICommand[] = [];
  private _commandPalette!: HTMLElement;
  private _commandInput!: HTMLInputElement;
  private _commandResults!: HTMLElement;
  private _focusedCommandIndex = -1;
  private _currentView = 'explorer';

  constructor() {
    super();
    this._instantiation = new InstantiationService();
  }

  async boot(): Promise<void> {
    this._initServices();
    this._initLayout();
    this._renderWorkbench();
    this._registerCommands();
    this._bindGlobalKeys();
    this._restore();
  }

  private _initServices(): void {
    this._fileService = new FileService();
    this._instantiation.register(IFileService, this._fileService);
    this._store.add(this._fileService);
  }

  private _initLayout(): void {
    this._editorPart = new EditorPart(this._fileService);
    this._sidebarPart = new SidebarPart(this._fileService);
    this._statusbarPart = new StatusbarPart(this._editorPart);
    this._fileExplorer = new FileExplorer(this._fileService, this._sidebarPart, this._editorPart);
    this._searchView = new SearchView(this._fileService, this._editorPart);

    this._store.add(this._editorPart);
    this._store.add(this._sidebarPart);
    this._store.add(this._statusbarPart);
    this._store.add(this._fileExplorer);
    this._store.add(this._searchView);
  }

  private _renderWorkbench(): void {
    this._editorPart.initialize();
    this._statusbarPart.initialize();

    const sidebarContent = document.getElementById('sidebar-content')!;
    this._searchView.initialize(sidebarContent);

    this._commandPalette = document.getElementById('command-palette')!;
    this._commandInput = document.getElementById('command-input') as HTMLInputElement;
    this._commandResults = document.getElementById('command-results')!;

    this._setupCommandPalette();
    this._setupActivityBar();
    this._setupWelcomeButtons();
    this._setupResizeHandle();

    window.addEventListener('resize', () => this._editorPart.layout());
  }

  private _setupCommandPalette(): void {
    this._commandInput.addEventListener('input', () => {
      this._filterCommands(this._commandInput.value);
    });

    this._commandInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this._hideCommandPalette();
      } else if (e.key === 'Enter') {
        this._executeSelectedCommand();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._moveFocus(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._moveFocus(-1);
      }
    });

    const backdrop = this._commandPalette.querySelector('.command-palette-backdrop')!;
    backdrop.addEventListener('click', () => this._hideCommandPalette());
  }

  private _setupActivityBar(): void {
    const items = document.querySelectorAll('.activity-item');
    items.forEach((item) => {
      item.addEventListener('click', () => {
        const view = (item as HTMLElement).dataset.view;
        if (!view) return;

        items.forEach((i) => i.classList.remove('active'));
        item.classList.add('active');

        this._switchView(view);
      });
    });
  }

  private _switchView(view: string): void {
    this._currentView = view;

    // Hide all panels
    const treeView = document.querySelector('.tree-view') as HTMLElement;
    if (treeView) treeView.style.display = 'none';
    this._searchView.hide();

    const header = document.getElementById('sidebar-header')!.querySelector('h3')!;

    switch (view) {
      case 'explorer':
        if (treeView) treeView.style.display = 'block';
        if (this._sidebarPart.rootPath) {
          const name = this._sidebarPart.rootPath.split(/[/\\]/).filter(Boolean).pop() ?? '';
          header.textContent = name.toUpperCase();
        } else {
          header.textContent = 'EXPLORER';
        }
        break;
      case 'search':
        header.textContent = 'SEARCH';
        this._searchView.show(this._sidebarPart.rootPath);
        break;
      case 'git':
        header.textContent = 'SOURCE CONTROL';
        break;
      case 'extensions':
        header.textContent = 'EXTENSIONS';
        break;
    }
  }

  private _setupWelcomeButtons(): void {
    const openFileBtn = document.getElementById('open-file-btn');
    const openFolderBtn = document.getElementById('open-folder-btn');

    openFileBtn?.addEventListener('click', () => this._openFile());
    openFolderBtn?.addEventListener('click', () => this._openFolder());
  }

  private _setupResizeHandle(): void {
    const sidebar = document.getElementById('sidebar')!;
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    sidebar.after(handle);

    handle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = sidebar.offsetWidth;
      handle.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const delta = e.clientX - startX;
      const newWidth = Math.max(170, Math.min(600, startWidth + delta));
      sidebar.style.width = `${newWidth}px`;
      this._editorPart.layout();
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        handle.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  private async _openFile(): Promise<void> {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
      });
      if (selected && typeof selected === 'string') {
        await this._editorPart.openFile(selected);
      }
    } catch (err) {
      console.error('Open file failed:', err);
    }
  }

  private async _openFolder(): Promise<void> {
    try {
      const selected = await open({
        multiple: false,
        directory: true,
      });
      if (selected && typeof selected === 'string') {
        await this._sidebarPart.openFolder(selected);
        this._statusbarPart.setFolderOpen(true);
        this._switchView('explorer');
        document.querySelector('.activity-item[data-view="explorer"]')?.classList.add('active');
      }
    } catch (err) {
      console.error('Open folder failed:', err);
    }
  }

  private _registerCommands(): void {
    this._commands = [
      {
        id: 'workbench.action.openFile',
        label: 'Open File',
        keybinding: 'Ctrl+O',
        handler: () => this._openFile(),
      },
      {
        id: 'workbench.action.openFolder',
        label: 'Open Folder',
        keybinding: 'Ctrl+K Ctrl+O',
        handler: () => this._openFolder(),
      },
      {
        id: 'workbench.action.save',
        label: 'Save File',
        keybinding: 'Ctrl+S',
        handler: () => this._editorPart.saveActiveFile(),
      },
      {
        id: 'workbench.action.closeEditor',
        label: 'Close Editor',
        keybinding: 'Ctrl+W',
        handler: () => {
          const tab = this._editorPart.activeTab;
          if (tab) this._editorPart.closeTab(tab.id);
        },
      },
      {
        id: 'workbench.action.toggleSidebar',
        label: 'Toggle Sidebar',
        keybinding: 'Ctrl+B',
        handler: () => {
          this._sidebarPart.toggle();
          this._editorPart.layout();
        },
      },
      {
        id: 'workbench.action.showExplorer',
        label: 'Show Explorer',
        keybinding: 'Ctrl+Shift+E',
        handler: () => {
          this._sidebarPart.show();
          this._switchView('explorer');
        },
      },
      {
        id: 'workbench.action.showSearch',
        label: 'Show Search',
        keybinding: 'Ctrl+Shift+F',
        handler: () => {
          this._sidebarPart.show();
          this._switchView('search');
        },
      },
      {
        id: 'workbench.action.quickOpen',
        label: 'Go to File',
        keybinding: 'Ctrl+P',
        handler: () => this._showCommandPalette('>'),
      },
      {
        id: 'workbench.action.newFile',
        label: 'New File',
        handler: async () => {
          if (this._sidebarPart.rootPath) {
            const name = prompt('New file name:');
            if (name) {
              const path = this._sidebarPart.rootPath + '/' + name;
              await this._fileService.write(path, '');
              await this._sidebarPart.refresh();
              await this._editorPart.openFile(path);
            }
          }
        },
      },
      {
        id: 'workbench.action.refreshExplorer',
        label: 'Refresh Explorer',
        handler: () => this._sidebarPart.refresh(),
      },
      {
        id: 'editor.action.formatDocument',
        label: 'Format Document',
        keybinding: 'Shift+Alt+F',
        handler: () => {
          this._editorPart.editor?.getAction('editor.action.formatDocument')?.run();
        },
      },
      {
        id: 'workbench.action.zoomIn',
        label: 'Zoom In',
        handler: () => {
          document.body.style.fontSize = `${parseFloat(getComputedStyle(document.body).fontSize) + 1}px`;
        },
      },
      {
        id: 'workbench.action.zoomOut',
        label: 'Zoom Out',
        handler: () => {
          document.body.style.fontSize = `${Math.max(10, parseFloat(getComputedStyle(document.body).fontSize) - 1)}px`;
        },
      },
      {
        id: 'workbench.action.toggleWordWrap',
        label: 'Toggle Word Wrap',
        keybinding: 'Alt+Z',
        handler: () => {
          const editor = this._editorPart.editor;
          if (editor) {
            const current = editor.getRawOptions().wordWrap;
            editor.updateOptions({ wordWrap: current === 'on' ? 'off' : 'on' });
          }
        },
      },
    ];
  }

  private _bindGlobalKeys(): void {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+P - command palette
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        this._showCommandPalette();
        return;
      }

      // Ctrl+P - quick open
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'p') {
        e.preventDefault();
        this._showCommandPalette();
        return;
      }

      // Ctrl+O - open file
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        this._openFile();
        return;
      }

      // Ctrl+B - toggle sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        this._sidebarPart.toggle();
        this._editorPart.layout();
        return;
      }

      // Ctrl+Shift+E - explorer
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        this._sidebarPart.show();
        this._switchView('explorer');
        return;
      }

      // Ctrl+Shift+F - search
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        this._sidebarPart.show();
        this._switchView('search');
        return;
      }
    });
  }

  private _showCommandPalette(initialValue = ''): void {
    this._commandPalette.classList.remove('hidden');
    this._commandInput.value = initialValue;
    this._commandInput.focus();
    this._focusedCommandIndex = -1;
    this._filterCommands(initialValue);
  }

  private _hideCommandPalette(): void {
    this._commandPalette.classList.add('hidden');
    this._commandInput.value = '';
    this._commandResults.innerHTML = '';
    this._focusedCommandIndex = -1;
    this._editorPart.editor?.focus();
  }

  private _filterCommands(query: string): void {
    this._commandResults.innerHTML = '';
    this._focusedCommandIndex = -1;

    const normalizedQuery = query.replace(/^>/, '').trim().toLowerCase();

    const filtered = this._commands.filter((cmd) =>
      cmd.label.toLowerCase().includes(normalizedQuery) ||
      cmd.id.toLowerCase().includes(normalizedQuery),
    );

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'command-item';
      empty.style.color = 'var(--vscode-descriptionForeground)';
      empty.textContent = 'No matching commands';
      this._commandResults.appendChild(empty);
      return;
    }

    filtered.forEach((cmd, index) => {
      const item = document.createElement('div');
      item.className = 'command-item';
      item.dataset.index = String(index);

      const label = document.createElement('span');
      label.className = 'command-item-label';
      label.textContent = cmd.label;

      item.appendChild(label);

      if (cmd.keybinding) {
        const kb = document.createElement('span');
        kb.className = 'command-item-keybinding';
        kb.textContent = cmd.keybinding;
        item.appendChild(kb);
      }

      item.addEventListener('click', () => {
        this._hideCommandPalette();
        cmd.handler();
      });

      item.addEventListener('mouseenter', () => {
        this._setFocusedCommand(index);
      });

      this._commandResults.appendChild(item);
    });
  }

  private _moveFocus(delta: number): void {
    const items = this._commandResults.querySelectorAll('.command-item');
    if (items.length === 0) return;

    let newIndex = this._focusedCommandIndex + delta;
    if (newIndex < 0) newIndex = items.length - 1;
    if (newIndex >= items.length) newIndex = 0;

    this._setFocusedCommand(newIndex);
  }

  private _setFocusedCommand(index: number): void {
    const items = this._commandResults.querySelectorAll('.command-item');
    items.forEach((i) => i.classList.remove('focused'));
    this._focusedCommandIndex = index;
    if (index >= 0 && index < items.length) {
      items[index].classList.add('focused');
      items[index].scrollIntoView({ block: 'nearest' });
    }
  }

  private _executeSelectedCommand(): void {
    const items = this._commandResults.querySelectorAll('.command-item');
    const index = this._focusedCommandIndex >= 0 ? this._focusedCommandIndex : 0;
    if (index < items.length) {
      (items[index] as HTMLElement).click();
    }
  }

  private _restore(): void {
    // Future: restore previously open files and workspace
    console.log('[SideX] Workbench ready');
  }

  override dispose(): void {
    this._store.dispose();
    super.dispose();
  }
}
