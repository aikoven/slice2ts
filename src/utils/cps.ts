export function cps(
  executor: (cb: (error: any) => void) => void,
): Promise<void>;
export function cps<T>(
  executor: (cb: (error: any, result: T) => void) => void,
): Promise<T>;
export function cps<T>(
  executor: (cb: (error: any, result?: T) => void) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) =>
    executor(
      (error, result) => (error != null ? reject(error) : resolve(result)),
    ),
  );
}
