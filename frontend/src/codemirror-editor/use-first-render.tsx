import { useRef, useEffect } from "react";

export const useFirstRender = () => {
  const firstRender = useRef<boolean>(true);

  useEffect(() => {
    firstRender.current = false;
  }, []);

  return firstRender.current;
};
