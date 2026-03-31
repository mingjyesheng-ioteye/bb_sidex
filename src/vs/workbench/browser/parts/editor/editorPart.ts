import * as monaco from 'monaco-editor';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle';
import { Emitter, type Event } from '../../../../base/common/event';
import type { IFileService, IFileContent } from '../../../../platform/files/common/files';

export interface ITab {
  id: string;
  path: string;
  name: string;
  language: string;
  isModified: boolean;
  model: monaco.editor.ITextModel;
}

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact',
    json: 'json', html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
    md: 'markdown', py: 'python', rs: 'rust', go: 'go', java: 'java',
    c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp',
    rb: 'ruby', php: 'php', sh: 'shell', bash: 'shell', zsh: 'shell',
    yaml: 'yaml', yml: 'yaml', toml: 'ini', xml: 'xml', svg: 'xml',
    sql: 'sql', dockerfile: 'dockerfile', makefile: 'plaintext',
    gitignore: 'plaintext', env: 'plaintext', txt: 'plaintext',
    vue: 'html', svelte: 'html', lock: 'json',
  };
  return map[ext] || 'plaintext';
}

function fileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const icons: Record<string, string> = {
    ts: '🟦', tsx: '⚛️', js: '🟨', jsx: '⚛️', json: '📋',
    html: '🌐', css: '🎨', md: '📝', py: '🐍', rs: '🦀',
    go: '🔵', java: '☕', toml: '⚙️', yaml: '⚙️', yml: '⚙️',
    sh: '📜', sql: '🗄️', svg: '🖼️', xml: '📄',
  };
  return icons[ext] || '📄';
}

export class EditorPart extends Disposable {
  private _editor: monaco.editor.IStandaloneCodeEditor | null = null;
  private readonly _tabs: ITab[] = [];
  private _activeTab: ITab | null = null;
  private readonly _container: HTMLElement;
  private readonly _tabBar: HTMLElement;
  private readonly _editorContainer: HTMLElement;
  private readonly _welcomeScreen: HTMLElement;
  private readonly _store = new DisposableStore();

  private readonly _onDidChangeActiveTab = new Emitter<ITab | null>();
  readonly onDidChangeActiveTab: Event<ITab | null> = this._onDidChangeActiveTab.event;

  private readonly _onDidChangeCursorPosition = new Emitter<monaco.Position>();
  readonly onDidChangeCursorPosition: Event<monaco.Position> = this._onDidChangeCursorPosition.event;

  private readonly _onDidChangeLanguage = new Emitter<string>();
  readonly onDidChangeLanguage: Event<string> = this._onDidChangeLanguage.event;

  constructor(
    private readonly _fileService: IFileService,
  ) {
    super();
    this._container = document.getElementById('main-content')!;
    this._tabBar = this._container.querySelector('.tab-bar')!;
    this._editorContainer = document.getElementById('editor-container')!;
    this._welcomeScreen = document.getElementById('welcome-screen')!;
  }

  initialize(): void {
    self.MonacoEnvironment = {
      getWorker(_workerId: string, label: string): Worker {
        if (label === 'json') {
          return new Worker(
            new URL('monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url),
            { type: 'module' },
          );
        }
        if (label === 'css' || label === 'scss' || label === 'less') {
          return new Worker(
            new URL('monaco-editor/esm/vs/language/css/css.worker.js', import.meta.url),
            { type: 'module' },
          );
        }
        if (label === 'html' || label === 'handlebars' || label === 'razor') {
          return new Worker(
            new URL('monaco-editor/esm/vs/language/html/html.worker.js', import.meta.url),
            { type: 'module' },
          );
        }
        if (label === 'typescript' || label === 'javascript') {
          return new Worker(
            new URL('monaco-editor/esm/vs/language/typescript/ts.worker.js', import.meta.url),
            { type: 'module' },
          );
        }
        return new Worker(
          new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
          { type: 'module' },
        );
      },
    };

    this._editor = monaco.editor.create(this._editorContainer, {
      value: '',
      language: 'plaintext',
      theme: 'vs-dark',
      automaticLayout: true,
      fontSize: 14,
      fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
      minimap: { enabled: true },
      scrollBeyondLastLine: true,
      renderWhitespace: 'selection',
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      padding: { top: 8 },
      lineNumbers: 'on',
      glyphMargin: true,
      folding: true,
      links: true,
      wordWrap: 'off',
      tabSize: 2,
      insertSpaces: true,
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      suggest: { showMethods: true, showFunctions: true, showConstructors: true },
    });

    this._editor.onDidChangeCursorPosition((e) => {
      this._onDidChangeCursorPosition.fire(e.position);
    });

    this._editor.onDidChangeModelLanguage((e) => {
      this._onDidChangeLanguage.fire(e.newLanguage);
    });

    // Ctrl+S to save
    this._editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      this.saveActiveFile();
    });

    // Ctrl+W to close tab
    this._editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW, () => {
      if (this._activeTab) {
        this.closeTab(this._activeTab.id);
      }
    });
  }

  get editor(): monaco.editor.IStandaloneCodeEditor | null {
    return this._editor;
  }

  get activeTab(): ITab | null {
    return this._activeTab;
  }

  get tabs(): ReadonlyArray<ITab> {
    return this._tabs;
  }

  async openFile(path: string): Promise<void> {
    const existing = this._tabs.find((t) => t.path === path);
    if (existing) {
      this._activateTab(existing);
      return;
    }

    let content: IFileContent;
    try {
      content = await this._fileService.read(path);
    } catch (err) {
      console.error('Failed to read file:', err);
      return;
    }

    const name = path.split(/[/\\]/).pop() ?? path;
    const language = detectLanguage(name);
    const uri = monaco.Uri.file(path);

    let model = monaco.editor.getModel(uri);
    if (!model) {
      model = monaco.editor.createModel(content.value, language, uri);
    } else {
      model.setValue(content.value);
    }

    const tab: ITab = {
      id: path,
      path,
      name,
      language,
      isModified: false,
      model,
    };

    model.onDidChangeContent(() => {
      tab.isModified = true;
      this._updateTabUI(tab);
    });

    this._tabs.push(tab);
    this._renderTab(tab);
    this._activateTab(tab);
  }

  private _activateTab(tab: ITab): void {
    this._activeTab = tab;

    // Update tab UI
    this._tabBar.querySelectorAll('.tab').forEach((el) => el.classList.remove('active'));
    const tabEl = this._tabBar.querySelector(`[data-tab-id="${CSS.escape(tab.id)}"]`);
    tabEl?.classList.add('active');

    // Switch model
    this._editor?.setModel(tab.model);

    // Show editor, hide welcome
    this._editorContainer.classList.add('active');
    this._welcomeScreen.classList.add('hidden');

    this._onDidChangeActiveTab.fire(tab);
    this._onDidChangeLanguage.fire(tab.language);

    this._editor?.focus();
  }

  closeTab(id: string): void {
    const index = this._tabs.findIndex((t) => t.id === id);
    if (index === -1) return;

    const tab = this._tabs[index];
    this._tabs.splice(index, 1);

    // Remove tab element
    const tabEl = this._tabBar.querySelector(`[data-tab-id="${CSS.escape(id)}"]`);
    tabEl?.remove();

    // Dispose model if no other tab uses it
    tab.model.dispose();

    if (this._activeTab?.id === id) {
      if (this._tabs.length > 0) {
        const next = this._tabs[Math.min(index, this._tabs.length - 1)];
        this._activateTab(next);
      } else {
        this._activeTab = null;
        this._editor?.setModel(null);
        this._editorContainer.classList.remove('active');
        this._welcomeScreen.classList.remove('hidden');
        this._onDidChangeActiveTab.fire(null);
      }
    }
  }

  async saveActiveFile(): Promise<void> {
    if (!this._activeTab || !this._editor) return;
    const content = this._activeTab.model.getValue();
    try {
      await this._fileService.write(this._activeTab.path, content);
      this._activeTab.isModified = false;
      this._updateTabUI(this._activeTab);
    } catch (err) {
      console.error('Failed to save file:', err);
    }
  }

  private _renderTab(tab: ITab): void {
    const tabEl = document.createElement('div');
    tabEl.className = 'tab';
    tabEl.dataset.tabId = tab.id;
    tabEl.title = tab.path;

    const icon = document.createElement('span');
    icon.className = 'tab-icon';
    icon.textContent = fileIcon(tab.name);

    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = tab.name;

    const close = document.createElement('button');
    close.className = 'tab-close';
    close.innerHTML = '×';
    close.title = 'Close';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(tab.id);
    });

    tabEl.appendChild(icon);
    tabEl.appendChild(label);
    tabEl.appendChild(close);

    tabEl.addEventListener('click', () => this._activateTab(tab));

    // Middle click to close
    tabEl.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        this.closeTab(tab.id);
      }
    });

    this._tabBar.appendChild(tabEl);
  }

  private _updateTabUI(tab: ITab): void {
    const tabEl = this._tabBar.querySelector(`[data-tab-id="${CSS.escape(tab.id)}"]`);
    if (!tabEl) return;
    tabEl.classList.toggle('modified', tab.isModified);
  }

  layout(): void {
    this._editor?.layout();
  }

  override dispose(): void {
    this._editor?.dispose();
    for (const tab of this._tabs) {
      tab.model.dispose();
    }
    this._store.dispose();
    this._onDidChangeActiveTab.dispose();
    this._onDidChangeCursorPosition.dispose();
    this._onDidChangeLanguage.dispose();
    super.dispose();
  }
}
