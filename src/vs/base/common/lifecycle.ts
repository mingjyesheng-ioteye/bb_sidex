export interface IDisposable {
  dispose(): void;
}

export function toDisposable(fn: () => void): IDisposable {
  let disposed = false;
  return {
    dispose() {
      if (!disposed) {
        disposed = true;
        fn();
      }
    },
  };
}

export class Disposable implements IDisposable {
  private _isDisposed = false;

  protected get isDisposed(): boolean {
    return this._isDisposed;
  }

  dispose(): void {
    this._isDisposed = true;
  }
}

export class DisposableStore implements IDisposable {
  private _toDispose = new Set<IDisposable>();
  private _isDisposed = false;

  add<T extends IDisposable>(o: T): T {
    if (this._isDisposed) {
      o.dispose();
      return o;
    }
    this._toDispose.add(o);
    return o;
  }

  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;
    for (const d of this._toDispose) {
      d.dispose();
    }
    this._toDispose.clear();
  }

  clear(): void {
    for (const d of this._toDispose) {
      d.dispose();
    }
    this._toDispose.clear();
  }
}

export class MutableDisposable<T extends IDisposable> implements IDisposable {
  private _value: T | undefined;

  get value(): T | undefined {
    return this._value;
  }

  set value(value: T | undefined) {
    this._value?.dispose();
    this._value = value;
  }

  dispose(): void {
    this._value?.dispose();
    this._value = undefined;
  }
}
