import { invoke } from '@tauri-apps/api/core';
import { listen, emit, type UnlistenFn } from '@tauri-apps/api/event';
import { Disposable } from '../../../common/lifecycle';
import { Emitter, type Event } from '../../../common/event';
import { toDisposable, type IDisposable } from '../../../common/lifecycle';

export interface ITauriCommand<R = unknown> {
  command: string;
  args?: Record<string, unknown>;
}

export class TauriIPCBridge extends Disposable {
  private readonly _onEvent = new Emitter<{ event: string; payload: unknown }>();
  readonly onEvent: Event<{ event: string; payload: unknown }> = this._onEvent.event;

  async invoke<R>(command: string, args?: Record<string, unknown>): Promise<R> {
    try {
      return await invoke<R>(command, args ?? {});
    } catch (err) {
      console.error(`[IPC] invoke "${command}" failed:`, err);
      throw err;
    }
  }

  async on(event: string, callback: (payload: unknown) => void): Promise<IDisposable> {
    const unlisten: UnlistenFn = await listen(event, (e) => {
      callback(e.payload);
      this._onEvent.fire({ event, payload: e.payload });
    });
    return toDisposable(() => unlisten());
  }

  async emitEvent(event: string, payload?: unknown): Promise<void> {
    await emit(event, payload);
  }

  override dispose(): void {
    this._onEvent.dispose();
    super.dispose();
  }
}

let _instance: TauriIPCBridge | undefined;

export function getTauriIPCBridge(): TauriIPCBridge {
  if (!_instance) {
    _instance = new TauriIPCBridge();
  }
  return _instance;
}
