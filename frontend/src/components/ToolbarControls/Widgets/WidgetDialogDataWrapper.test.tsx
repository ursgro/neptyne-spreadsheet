import { render, waitFor } from "@testing-library/react";
import {
  WidgetDialogDataWrapper,
  WidgetDialogDataWrapperProps,
} from "./WidgetDialogDataWrapper";

jest.mock("./WidgetDialog", () => ({
  WidgetDialog: () => null,
}));

const noop = () => {};

const DEFAULT_PROPS: WidgetDialogDataWrapperProps = {
  onClose: noop,
  onUpdateCellValues: noop,
  widgetRegistry: { widgets: {} },
  sheetSelection: { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
  getAutocomplete: () => Promise.resolve({ result: [] }),
  validateWidgetParams: () => Promise.resolve({}),
  getWidgetState: () => Promise.resolve({}),
  onCreateFunctionSubmit: noop,
  currentSheet: 0,
};

test("WidgetDialogDataWrapper does not update on selection change", async () => {
  const getWidgetState = jest.fn(() => Promise.resolve({}));
  const { rerender } = render(
    <WidgetDialogDataWrapper {...DEFAULT_PROPS} getWidgetState={getWidgetState} />
  );
  expect(getWidgetState).toHaveBeenCalledTimes(1);
  getWidgetState.mockReset();
  rerender(
    <WidgetDialogDataWrapper
      {...DEFAULT_PROPS}
      sheetSelection={{ start: { row: 1, col: 1 }, end: { row: 1, col: 1 } }}
      currentSheet={1}
    />
  );
  await waitFor(() => {
    expect(getWidgetState).toHaveBeenCalledTimes(0);
  });
});
