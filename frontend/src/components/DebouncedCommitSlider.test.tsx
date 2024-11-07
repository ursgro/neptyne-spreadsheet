import { fireEvent, render } from "@testing-library/react";
import { DebouncedCommitSlider } from "./DebouncedCommitSlider";
import { act } from "react-dom/test-utils";

test("DebouncedCommitSlider submits value only when mouse is released", async () => {
  const handleCommit = jest.fn();
  const { getByRole } = render(
    <DebouncedCommitSlider value={20} onCommit={handleCommit} />
  );

  const slider = getByRole("slider");

  await act(async () => {
    fireEvent.mouseDown(slider);
    fireEvent.mouseMove(slider, { clientX: 50 });
    fireEvent.mouseMove(slider, { clientX: -20 });
    fireEvent.mouseMove(slider, { clientX: 70 });
    fireEvent.mouseUp(slider);

    fireEvent.mouseDown(slider);
    fireEvent.mouseMove(slider, { clientX: -50 });
    fireEvent.mouseUp(slider);
  });

  expect(handleCommit).toHaveBeenCalledTimes(2);
});

test("DebouncedCommitSlider submits value only when key is released", async () => {
  const handleCommit = jest.fn();
  const { getByRole } = render(
    <DebouncedCommitSlider value={20} onCommit={handleCommit} />
  );

  const slider = getByRole("slider");

  await act(async () => {
    fireEvent.keyDown(slider, { keyCode: 39 });
    await new Promise((r) => setTimeout(r, 50));
    fireEvent.keyUp(slider, { keyCode: 39 });

    fireEvent.keyDown(slider, { keyCode: 39 });
    await new Promise((r) => setTimeout(r, 50));
    fireEvent.keyUp(slider, { keyCode: 39 });
  });

  expect(handleCommit).toHaveBeenCalledTimes(2);
});
