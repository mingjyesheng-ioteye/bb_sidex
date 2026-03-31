import { Disposable, type IDisposable } from '../../../base/common/lifecycle';
import type { IFileService, ISearchResult } from '../../../platform/files/common/files';
import type { EditorPart } from '../../browser/parts/editor/editorPart';

export class SearchView extends Disposable {
  private _panel: HTMLElement | null = null;
  private _input: HTMLInputElement | null = null;
  private _results: HTMLElement | null = null;
  private _rootPath: string | null = null;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly _fileService: IFileService,
    private readonly _editorPart: EditorPart,
  ) {
    super();
  }

  initialize(sidebarContent: HTMLElement): void {
    this._panel = document.createElement('div');
    this._panel.id = 'search-panel';
    this._panel.innerHTML = `
      <div class="search-input-container">
        <input type="text" placeholder="Search files..." id="search-input-field" />
      </div>
      <div id="search-results"></div>
    `;
    sidebarContent.appendChild(this._panel);

    this._input = this._panel.querySelector('#search-input-field')!;
    this._results = this._panel.querySelector('#search-results')!;

    this._input.addEventListener('input', () => {
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => this._performSearch(), 300);
    });

    this._input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this._input!.blur();
      }
    });
  }

  show(rootPath: string | null): void {
    this._rootPath = rootPath;
    if (this._panel) {
      this._panel.classList.add('active');
      this._input?.focus();
    }
  }

  hide(): void {
    if (this._panel) {
      this._panel.classList.remove('active');
    }
  }

  private async _performSearch(): Promise<void> {
    if (!this._input || !this._results || !this._rootPath) return;

    const query = this._input.value.trim();
    if (!query) {
      this._results.innerHTML = '';
      return;
    }

    this._results.innerHTML = '<div style="padding: 8px 12px; color: var(--vscode-descriptionForeground);">Searching...</div>';

    try {
      const results = await this._fileService.search(this._rootPath, query);
      this._renderResults(results, query);
    } catch (err) {
      this._results.innerHTML = '<div style="padding: 8px 12px; color: #f44;">Search failed</div>';
    }
  }

  private _renderResults(results: ISearchResult[], query: string): void {
    if (!this._results) return;
    this._results.innerHTML = '';

    if (results.length === 0) {
      this._results.innerHTML = '<div style="padding: 8px 12px; color: var(--vscode-descriptionForeground);">No results found</div>';
      return;
    }

    let totalMatches = 0;

    for (const result of results) {
      totalMatches += result.matches.length;

      const relativePath = this._rootPath
        ? result.path.replace(this._rootPath, '').replace(/^[/\\]/, '')
        : result.path;

      const fileEl = document.createElement('div');
      fileEl.className = 'search-result-file';
      fileEl.textContent = `${relativePath} (${result.matches.length})`;
      this._results.appendChild(fileEl);

      for (const match of result.matches.slice(0, 10)) {
        const lineEl = document.createElement('div');
        lineEl.className = 'search-result-line';

        const lineNum = document.createElement('span');
        lineNum.style.color = 'var(--vscode-descriptionForeground)';
        lineNum.style.marginRight = '8px';
        lineNum.textContent = `${match.lineNumber}:`;

        const before = match.lineContent.substring(0, match.matchStart);
        const matched = match.lineContent.substring(match.matchStart, match.matchEnd);
        const after = match.lineContent.substring(match.matchEnd);

        lineEl.appendChild(lineNum);
        lineEl.appendChild(document.createTextNode(before.trimStart()));

        const highlight = document.createElement('span');
        highlight.className = 'search-match';
        highlight.textContent = matched;
        lineEl.appendChild(highlight);

        lineEl.appendChild(document.createTextNode(after));

        lineEl.addEventListener('click', () => {
          this._editorPart.openFile(result.path);
        });

        this._results!.appendChild(lineEl);
      }
    }

    const summary = document.createElement('div');
    summary.style.cssText = 'padding: 8px 12px; color: var(--vscode-descriptionForeground); font-size: 11px; border-top: 1px solid var(--vscode-panel-border); margin-top: 4px;';
    summary.textContent = `${totalMatches} result${totalMatches !== 1 ? 's' : ''} in ${results.length} file${results.length !== 1 ? 's' : ''}`;
    this._results.appendChild(summary);
  }

  override dispose(): void {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    super.dispose();
  }
}
