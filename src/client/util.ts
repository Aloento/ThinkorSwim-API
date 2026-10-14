export declare type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[P] extends readonly (infer X)[]
      ? readonly DeepPartial<X>[]
      : DeepPartial<T[P]>;
};

export function throwError(msg: string): never {
  throw new Error(msg);
}

export function ensure<T>(value: T, msg: string): T {
  if (!value) {
    throwError(msg);
  }
  return value;
}

export function debugLog(...args: any[]) {
  if (process.env.NODE_ENV === "development") {
    console.log(...args);
  }
}

export type Constructor<T> = new (...args: any[]) => T;

// https://stackoverflow.com/questions/17392349/how-can-i-check-if-element-is-an-instanceof-u
// Filters the array to only elements of the specified type.
export function ofType<TElements, TFilter extends TElements>(
  array: TElements[],
  filterType: Constructor<TFilter>,
): TFilter[] {
  return array.filter((e): e is TFilter => e instanceof filterType);
}

export function findByType<TElements, TFilter extends TElements>(
  array: TElements[],
  filterType: Constructor<TFilter>,
): TFilter | undefined {
  return array.find((e): e is TFilter => e instanceof filterType);
}

export function findByTypeOrThrow<TElements, TFilter extends TElements>(
  array: TElements[],
  filterType: Constructor<TFilter>,
): TFilter {
  return (
    findByType(array, filterType) ??
    throwError(`Element with type not found: ${filterType.name}`)
  );
}

// P6（docs/TECHNICAL.md）：原实现 Math.random()*1e9 可碰撞。随机 UUID 在 Node ≥19 与
// 浏览器（window.crypto）都可用，作为请求 id 足够唯一。
export const newRandomId = () => crypto.randomUUID();
