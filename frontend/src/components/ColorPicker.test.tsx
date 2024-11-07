import { render } from "@testing-library/react";
import { act } from "react-dom/test-utils";
import { COLORS, ColorPicker } from "./ColorPicker";
import userEvent from "@testing-library/user-event";

test("ColorPicker submits value on mouse click", async () => {
  const handleSelect = jest.fn();
  const { getByTestId } = render(
    <ColorPicker colors={COLORS} value={COLORS[0]} onSelect={handleSelect} />
  );

  const list = getByTestId("color-list");

  await act(async () => {
    await userEvent.click(list.children[1]);
  });

  expect(handleSelect).toHaveBeenCalledWith(COLORS[1]);
});

test("ColorPicker submits value on Enter", async () => {
  const handleSelect = jest.fn();
  const { getByTestId } = render(
    <ColorPicker colors={COLORS} value={COLORS[0]} onSelect={handleSelect} />
  );

  await act(async () => {
    await userEvent.type(getByTestId("color-list"), "{enter}");
  });

  expect(handleSelect).toHaveBeenCalledWith(COLORS[0]);
});
