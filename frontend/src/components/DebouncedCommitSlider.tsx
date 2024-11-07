import { Slider } from "@mui/material";
import {
  FunctionComponent,
  useState,
  useEffect,
  useCallback,
  useRef,
  KeyboardEventHandler,
  SyntheticEvent,
} from "react";

type OnCommitCallback = NonNullable<DebouncedCommitSliderProps["onChangeCommitted"]>;

interface DebouncedCommitSliderProps extends React.ComponentProps<typeof Slider> {
  onCommit: OnCommitCallback;
}

export const DebouncedCommitSlider: FunctionComponent<DebouncedCommitSliderProps> = ({
  onCommit,
  ...props
}) => {
  const commitProps = useDebouncedCommitState(props.value, onCommit);

  return <Slider {...props} {...commitProps} />;
};

/**
 * The "commit" operation of this slider is very expensive, since it sends value to back-end and
 * re-renders entire grid on each value change.
 *
 * What we do here is:
 * - have internal controled state to show how slider moves responsively. We update this state
 * on onChange;
 *
 * - have state committed on onChangeCommitted in case of mouse events - it is fired only
 * after onMouseUp event;
 *
 * - since changes via arrow keys fire onChangeCommitted on every value change, we have to
 * track if key is pressed. So keyboard changes are tracked manually using onKeyDown, onKeyUp and
 * isMovingWithKeyboard;
 */
const useDebouncedCommitState = (
  initialValue: DebouncedCommitSliderProps["value"],
  handleChangeCommitted: OnCommitCallback
): Partial<DebouncedCommitSliderProps> => {
  const [value, setValue] = useState(initialValue);
  const isMovingWithKeyboard = useRef(false);

  useEffect(() => setValue(initialValue), [initialValue]);

  const onChange = useCallback((e: Event, newValue: number | number[]) => {
    if (!Number.isNaN(newValue)) {
      setValue(newValue);
    }
  }, []);

  const onKeyDown = useCallback(() => (isMovingWithKeyboard.current = true), []);
  const onKeyUp: KeyboardEventHandler<HTMLInputElement> = useCallback(
    (event) => {
      isMovingWithKeyboard.current = false;
      handleChangeCommitted(event, value!);
    },
    [handleChangeCommitted, value]
  );

  const onChangeCommitted = useCallback(
    (event: Event | SyntheticEvent<Element, Event>, value: number | number[]) => {
      if (!isMovingWithKeyboard.current) {
        handleChangeCommitted(event, value);
      }
    },
    [handleChangeCommitted]
  );

  return { value, onChange, onKeyDown, onKeyUp, onChangeCommitted };
};
