import { Workbench } from '../../workbench/browser/workbench';

export async function main(): Promise<void> {
  const workbench = new Workbench();
  await workbench.boot();

  // Expose for debugging in dev
  if (import.meta.env.DEV) {
    (window as any).__sidex = { workbench };
  }
}
