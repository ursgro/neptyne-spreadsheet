import React, {
  ComponentProps,
  ComponentType,
  NamedExoticComponent,
  Profiler,
  PropsWithRef,
  useCallback,
} from "react";

export type ProfiledComponent<T> = NamedExoticComponent<T> & {
  __numRenders: number;
  __rendersByPropValue: DefaultMap<T[keyof T], number, number>;
  clearCounters: () => void;
};

class DefaultMap<K, V, D> extends Map {
  defaultValue: D;
  constructor(defaultValue: D) {
    super();
    this.defaultValue = defaultValue;
  }

  get(key: K): V | D {
    return this.has(key) ? super.get(key) : this.defaultValue;
  }
}

// inspired with https://github.com/bvaughn/jest-react-profiler/blob/master/index.js
export const withProfiler = <T extends ComponentType<any>>(
  Component: T,
  id: string = "rootComponent",
  mapByProp?: keyof ComponentProps<T>
) => {
  type componentPropValue = ComponentProps<T>[keyof ComponentProps<T>];
  const componentId = `withProfiler${id}`;

  const onRender = (propValue?: componentPropValue) => {
    SnapshotProfiler.__numRenders++;
    if (propValue)
      SnapshotProfiler.__rendersByPropValue.set(
        propValue,
        SnapshotProfiler.__rendersByPropValue.get(propValue) + 1
      );
  };

  const SnapshotProfiler = React.memo((props: ComponentProps<T>) => {
    const handleRender = useCallback(
      () => onRender(mapByProp && props[mapByProp]),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [mapByProp && props[mapByProp]]
    );
    return (
      <Profiler id={componentId} onRender={handleRender}>
        <Component {...props} />
      </Profiler>
    );
  }) as unknown as ProfiledComponent<PropsWithRef<ComponentProps<T>>>;

  SnapshotProfiler.__numRenders = 0;
  SnapshotProfiler.__rendersByPropValue = new DefaultMap<
    ComponentProps<T>[keyof ComponentProps<T>],
    number,
    number
  >(0);

  SnapshotProfiler.clearCounters = function () {
    this.__numRenders = 0;
    this.__rendersByPropValue.clear();
  };

  return SnapshotProfiler as ProfiledComponent<ComponentProps<T>>;
};
