import { useCallback, useRef } from "react";

// pulled version of https://github.com/Andarist/use-composed-ref.
// I could not use library itself because its typing implied refs could only be DOM elements.
// Of course I could add type augmentation, but since it was a one-file library I decided it would
// be clearer just to pull it.

type UserRef<T> =
  | ((instance: T | null) => void)
  | React.RefObject<T>
  | null
  | undefined;

type Writable<T> = { -readonly [P in keyof T]: T[P] };

const updateRef = <T>(ref: NonNullable<UserRef<T>>, value: T | null) => {
  if (typeof ref === "function") {
    ref(value);
    return;
  }

  (ref as Writable<typeof ref>).current = value;
};

export const useComposedRef = <T>(
  libRef: React.MutableRefObject<T | null>,
  userRef: UserRef<T>
) => {
  const prevUserRef = useRef<UserRef<T>>();

  return useCallback(
    (instance: T | null) => {
      libRef.current = instance;

      if (prevUserRef.current) {
        updateRef(prevUserRef.current, null);
      }

      prevUserRef.current = userRef;

      if (!userRef) {
        return;
      }

      updateRef(userRef, instance);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userRef]
  );
};
