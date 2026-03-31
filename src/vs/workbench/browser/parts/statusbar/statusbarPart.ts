import { Disposable, type IDisposable } from '../../../../base/common/lifecycle';
import type { EditorPart } from '../editor/editorPart';

export class StatusbarPart extends Disposable {
  private readonly _lineCol: HTMLElement;
  private readonly _language: HTMLElement;
  private readonly _encoding: HTMLElement;
  private readonly _eol: HTMLElement;
  private readonly _statusbar: HTMLElement;
  private readonly _subscriptions: IDisposable[] = [];

  constructor(private readonly _editorPart: EditorPart) {
    super();
    this._statusbar = document.getElementById('statusbar')!;
    this._lineCol = document.getElementById('line-col')!;
    this._language = document.getElementById('language')!;
    this._encoding = document.getElementById('encoding')!;
    this._eol = document.getElementById('eol')!;

    this._statusbar.classList.add('no-folder');
  }

  initialize(): void {
    this._subscriptions.push(
      this._editorPart.onDidChangeCursorPosition((pos) => {
        this._lineCol.textContent = `Ln ${pos.lineNumber}, Col ${pos.column}`;
      }),
    );

    this._subscriptions.push(
      this._editorPart.onDidChangeLanguage((lang) => {
        this._language.textContent = this._formatLanguage(lang);
      }),
    );

    this._subscriptions.push(
      this._editorPart.onDidChangeActiveTab((tab) => {
        if (tab) {
          this._language.textContent = this._formatLanguage(tab.language);
          this._encoding.textContent = 'UTF-8';
          this._eol.textContent = 'LF';
        } else {
          this._lineCol.textContent = '';
          this._language.textContent = '';
          this._encoding.textContent = '';
          this._eol.textContent = '';
        }
      }),
    );
  }

  setFolderOpen(open: boolean): void {
    this._statusbar.classList.toggle('no-folder', !open);
  }

  private _formatLanguage(lang: string): string {
    const names: Record<string, string> = {
      typescript: 'TypeScript', typescriptreact: 'TypeScript React',
      javascript: 'JavaScript', javascriptreact: 'JavaScript React',
      json: 'JSON', html: 'HTML', css: 'CSS', scss: 'SCSS', less: 'Less',
      markdown: 'Markdown', python: 'Python', rust: 'Rust',
      go: 'Go', java: 'Java', c: 'C', cpp: 'C++', csharp: 'C#',
      ruby: 'Ruby', php: 'PHP', shell: 'Shell Script',
      yaml: 'YAML', xml: 'XML', sql: 'SQL',
      plaintext: 'Plain Text', ini: 'INI',
    };
    return names[lang] || lang;
  }

  override dispose(): void {
    for (const sub of this._subscriptions) {
      sub.dispose();
    }
    super.dispose();
  }
}
