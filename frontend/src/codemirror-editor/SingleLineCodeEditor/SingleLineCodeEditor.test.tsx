import { render } from "@testing-library/react";
import { SingleLineCodeEditor } from "./SingleLineCodeEditor";

test("SingleLineCodeEditor should render value", () => {
  const { getByText } = render(<SingleLineCodeEditor value="foo" />);

  expect(getByText("foo")).toBeInTheDocument();
});

test("SingleLineCodeEditor should re-render value", () => {
  const { getByText, queryByText, rerender } = render(
    <SingleLineCodeEditor value="foo" />
  );

  rerender(<SingleLineCodeEditor value="bar" />);

  expect(queryByText("foo")).not.toBeInTheDocument();
  expect(getByText("bar")).toBeInTheDocument();
});
