export interface ServiceIdentifier<T> {
  (...args: any[]): void;
  type: T;
}

const serviceIds = new Map<string, ServiceIdentifier<any>>();

export function createDecorator<T>(serviceId: string): ServiceIdentifier<T> {
  if (serviceIds.has(serviceId)) {
    return serviceIds.get(serviceId)!;
  }

  const id = function (target: any, _key: string, index: number): void {
    if (arguments.length !== 3) {
      throw new Error(`@${serviceId} decorator can only be used on constructor parameters`);
    }
    if (!target._dependencies) {
      target._dependencies = [];
    }
    target._dependencies[index] = id;
  } as any;

  id.toString = () => serviceId;
  serviceIds.set(serviceId, id);
  return id;
}

export interface IInstantiationService {
  readonly serviceBrand: undefined;
  get<T>(id: ServiceIdentifier<T>): T;
  register<T>(id: ServiceIdentifier<T>, instance: T): void;
}

export class InstantiationService implements IInstantiationService {
  readonly serviceBrand: undefined;
  private readonly _services = new Map<ServiceIdentifier<any>, any>();

  constructor() {
    this._services.set(IInstantiationServiceId, this);
  }

  get<T>(id: ServiceIdentifier<T>): T {
    const service = this._services.get(id);
    if (!service) {
      throw new Error(`Service not found: ${id}`);
    }
    return service;
  }

  register<T>(id: ServiceIdentifier<T>, instance: T): void {
    this._services.set(id, instance);
  }
}

export const IInstantiationServiceId = createDecorator<IInstantiationService>('instantiationService');
