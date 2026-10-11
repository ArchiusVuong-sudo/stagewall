/** Run at most `n` async jobs at once. */
export function createLimiter(n: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  const next = () => {
    if (active >= n) return;
    const start = waiting.shift();
    if (start) {
      active++;
      start();
    }
  };
  return function run<T>(job: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      waiting.push(() => {
        job()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
  };
}

/** Map with bounded concurrency, keeping input order. */
export async function mapLimit<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const run = createLimiter(n);
  return Promise.all(items.map((item, i) => run(() => fn(item, i))));
}
