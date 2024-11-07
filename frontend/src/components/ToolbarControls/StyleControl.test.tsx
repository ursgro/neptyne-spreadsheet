import { render } from "@testing-library/react";
import { act } from "react-dom/test-utils";
import userEvent from "@testing-library/user-event";
import { ALLOWED_FONTS } from "../../SheetUtils";
import { StyleControl, StyleControlProps } from "./StyleControl";
import { CellAttribute, TextStyle } from "../../NeptyneProtocol";

const BLANK_ATTRIBUTES = {};
const noop = () => {};

const MockedStyleControl = (props: Partial<StyleControlProps>) => (
  <StyleControl
    cellAttributes={BLANK_ATTRIBUTES}
    onSelectionAttributeChange={noop}
    onClearFormatting={noop}
    isDisabled={false}
    isCopyingFormat={false}
    onCopyFormatToggle={noop}
    {...props}
  />
);

test("StyleControl displays default values", async () => {
  const { getByTestId } = render(<MockedStyleControl />);

  await act(async () => await userEvent.click(getByTestId("ToolbarStyleButton")));

  expect(getByTestId("StyleBoldButton").classList.contains("is-selected")).toBe(false);
  expect(getByTestId("StyleItalicButton").classList.contains("is-selected")).toBe(
    false
  );
  expect(getByTestId("StyleUnderlineButton").classList.contains("is-selected")).toBe(
    false
  );

  expect(getByTestId("style-control-font-select")).toHaveTextContent(
    ALLOWED_FONTS[0].label
  );
});

test("StyleControl displays custom values", async () => {
  const { getByTestId } = render(
    <MockedStyleControl
      cellAttributes={{
        [CellAttribute.TextStyle]: `${TextStyle.Bold} ${TextStyle.Underline}`,
        [CellAttribute.Font]: ALLOWED_FONTS[1].cssName,
      }}
    />
  );

  await act(async () => await userEvent.click(getByTestId("ToolbarStyleButton")));

  expect(getByTestId("StyleBoldButton").classList.contains("is-selected")).toBe(true);
  expect(getByTestId("StyleItalicButton").classList.contains("is-selected")).toBe(
    false
  );
  expect(getByTestId("StyleUnderlineButton").classList.contains("is-selected")).toBe(
    true
  );

  expect(getByTestId("style-control-font-select")).toHaveTextContent(
    ALLOWED_FONTS[1].label
  );
});
