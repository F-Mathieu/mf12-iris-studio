import { toast } from 'sonner';
/** Runs an async action with toast feedback. Returns the result (true for void actions) or undefined on error. */
export async function act<T>(fn: () => Promise<T>, success?: string | ((r: T) => string)): Promise<([T] extends [void | undefined] ? true : T) | undefined> {
  try {
    const r = await fn();
    if (success) toast.success(typeof success === 'function' ? success(r) : success);
    return (r === undefined ? true : r) as [T] extends [void | undefined] ? true : T;
  } catch (e) {
    console.error(e);
    toast.error(e instanceof Error ? e.message : String(e));
    return undefined;
  }
}
