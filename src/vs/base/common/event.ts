import { IDisposable, DisposableStore, toDisposable } from './lifecycle';

export type Event<T> = (listener: (e: T) => void) => IDisposable;

export namespace Event {
  export const None: Event<never> = () => ({ dispose() {} });

  export function once<T>(event: Event<T>): Event<T> {
    return (listener: (e: T) => void) => {
      let didFire = false;
      const sub = event((e) => {
        if (!didFire) {
          didFire = true;
          sub.dispose();
          listener(e);
        }
      });
      return sub;
    };
  }

  export function map<I, O>(event: Event<I>, fn: (e: I) => O): Event<O> {
    return (listener: (e: O) => void) => event((e) => listener(fn(e)));
  }

  export function filter<T>(event: Event<T>, fn: (e: T) => boolean): Event<T> {
    return (listener: (e: T) => void) => event((e) => { if (fn(e)) listener(e); });
  }
}

export class Emitter<T> implements IDisposable {
  private _listeners = new Set<(e: T) => void>();
  private _disposed = false;
  private _event?: Event<T>;

  get event(): Event<T> {
    if (!this._event) {
      this._event = (listener: (e: T) => void) => {
        if (this._disposed) return { dispose() {} };
        this._listeners.add(listener);
        return toDisposable(() => this._listeners.delete(listener));
      };
    }
    return this._event;
  }

  fire(event: T): void {
    if (this._disposed) return;
    for (const listener of [...this._listeners]) {
      listener(event);
    }
  }

  hasListeners(): boolean {
    return this._listeners.size > 0;
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._listeners.clear();
    this._event = undefined;
  }
}

export class EventMultiplexer<T> implements IDisposable {
  private readonly _emitter = new Emitter<T>();
  private readonly _store = new DisposableStore();

  get event(): Event<T> {
    return this._emitter.event;
  }

  add(event: Event<T>): void {
    this._store.add(event((e) => this._emitter.fire(e)));
  }

  dispose(): void {
    this._store.dispose();
    this._emitter.dispose();
  }
}
