import { render } from "@testing-library/react";
import ShareDialog from "./ShareDialog";
import { AccessLevel, AccessScope, TyneShareResponse } from "../NeptyneProtocol";
import { ComponentProps } from "react";

const DEFAULT_PROPS: ComponentProps<typeof ShareDialog> = {
  open: true,
  shares: [],
  users: [],
  loading: false,
  tyneDescription: "",
  tyneName: "",
  onSubmit: function (response: TyneShareResponse): void {
    throw new Error("Function not implemented.");
  },
  onClose: function (): void {
    throw new Error("Function not implemented.");
  },
  generalAccessLevel: AccessLevel.View,
  generalAccessScope: AccessScope.Restricted,
  canAccessShareRecords: true,
  isApp: false,
};

test("shows people with access", () => {
  const { getByTestId } = render(
    <ShareDialog
      {...DEFAULT_PROPS}
      shares={[
        { name: "me", email: "me@neptyne.com", access_level: AccessLevel.Owner },
        { name: "you", email: "you@neptyne.com", access_level: AccessLevel.Edit },
      ]}
    />
  );

  expect(getByTestId("person-access-me")).toBeInTheDocument();
  expect(getByTestId("person-access-you")).toBeInTheDocument();
});

test("lets change access level for current shares", () => {
  const { getByTestId } = render(
    <ShareDialog
      {...DEFAULT_PROPS}
      shares={[
        { name: "me", email: "me@neptyne.com", access_level: AccessLevel.Owner },
        { name: "you", email: "you@neptyne.com", access_level: AccessLevel.Edit },
      ]}
    />
  );

  const meSelect = getByTestId("person-access-me").querySelector(
    '[data-testid="access-level-select"] input'
  );
  const youSelect = getByTestId("person-access-you").querySelector(
    '[data-testid="access-level-select"] input'
  );

  expect(meSelect).toHaveAttribute("disabled");
  expect(meSelect).toHaveValue(AccessLevel.Owner);
  expect(youSelect).not.toHaveAttribute("disabled");
  expect(youSelect).toHaveValue(AccessLevel.Edit);
});

test("shows users to invite", () => {
  const { getByTestId } = render(
    <ShareDialog
      {...DEFAULT_PROPS}
      shares={[
        { name: "me", email: "me@neptyne.com", access_level: AccessLevel.Owner },
        { name: "you", email: "you@neptyne.com", access_level: AccessLevel.Edit },
      ]}
    />
  );

  const meSelect = getByTestId("person-access-me").querySelector(
    '[data-testid="access-level-select"] input'
  );
  const youSelect = getByTestId("person-access-you").querySelector(
    '[data-testid="access-level-select"] input'
  );

  expect(meSelect).toHaveAttribute("disabled");
  expect(meSelect).toHaveValue(AccessLevel.Owner);
  expect(youSelect).not.toHaveAttribute("disabled");
  expect(youSelect).toHaveValue(AccessLevel.Edit);
});
