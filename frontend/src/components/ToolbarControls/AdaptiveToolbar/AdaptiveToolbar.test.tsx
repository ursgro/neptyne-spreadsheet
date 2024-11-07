import { render } from "@testing-library/react";

import { AdaptiveToolbar } from "./AdaptiveToolbar";

test("Adaptive toolbar should display its content", () => {
  const { getByText } = render(<AdaptiveToolbar>foobar!</AdaptiveToolbar>);

  expect(getByText("foobar!")).toBeInTheDocument();
});
