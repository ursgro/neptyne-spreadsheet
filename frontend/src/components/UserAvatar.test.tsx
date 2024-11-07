import { render } from "@testing-library/react";
import { getColor, getInitials, UserAvatar } from "./UserAvatar";

test("UserAvatar displays fallback when image is unavailable", () => {
  const { container } = render(<UserAvatar email="me@neptyne.com" name="John Doe" />);

  expect(container).toHaveTextContent("JD");
});

test.each<string>(["me@gmail.com", "john@gmail.com", "1@abzzzzz", ""])(
  "getColor results are stable with the same input",
  (input) => expect(getColor(input)).toBe(getColor(input))
);

test("getColor results are different for different input", () => {
  expect(getColor("me@gmail.com")).not.toBe(getColor("john@gmail.com"));
});

test.each<[string, string]>([
  ["John Doe", "JD"],
  ["Rihanna", "R"],
  ["", ""],
  ["Dutch van der Linde", "DL"],
])("getInitials should reduce names to their initials", (name, initials) =>
  expect(getInitials(name)).toBe(initials)
);
