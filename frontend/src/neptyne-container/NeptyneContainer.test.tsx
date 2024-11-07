import "jest-canvas-mock";
import "../jestMockJsdom";
import "../jestMockCanvas";

import userEvent from "@testing-library/user-event";
import {
  Matcher,
  MatcherOptions,
  act,
  render,
  waitFor,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import { NeptyneContainer, RemoteTyne } from "./NeptyneContainer";
import { BrowserRouter, Location, NavigateFunction } from "react-router-dom";
import { KernelSession } from "../KernelSession";
import * as FetchForTyne from "./fetch-for-tyne";
import { User } from "../user-context";

const MOCK_USER = {
  displayName: "Me",
  email: "me@meptyne.com",
  getIdToken: jest.fn().mockResolvedValue("foo"),
} as unknown as User;

const MOCK_LOCATION = {
  pathname: "sometyne",
} as Location;
const MOCK_NAVIGATE = jest.fn() as NavigateFunction;

const MOCK_TYNE = {
  access_level: "EDIT",
  sheets: [
    {
      n_rows: 1000,
      n_cols: 26,
      sheet_attributes: {},
      cells: [
        {
          cellId: [0, 0, 0],
          code: "123123123123123\n1ds30000asdadsfasdf",
          outputs: [
            {
              data: {
                "application/json": "123123123123123\n1ds30000asdadsfasdf",
              },
              output_type: "execute_result",
            },
          ],
          attributes: {
            lineWrap: "autosize",
            executionPolicy: "-1",
          },
        },
      ],
      sheet_id: 0,
      name: "Sheet0",
    },
    {
      n_rows: 1000,
      n_cols: 26,
      sheet_attributes: {},
      cells: [],
      sheet_id: 1,
      name: "Sheet1",
    },
  ],
  notebooks: [
    {
      cells: [
        {
          cell_type: "code",
          source: "",
          outputs: [],
          execution_count: -1,
          metadata: {
            isInitCell: true,
          },
        },
      ],
    },
  ],
  file_name: "uafdxhboyz",
  name: "Untitled",
  requirements: "",
  properties: {},
} as unknown as RemoteTyne;

const COMMON_PROPS = {
  user: MOCK_USER,
  location: MOCK_LOCATION,
  navigate: MOCK_NAVIGATE,
  appModeRestricted: false,
};

const fetchForTyne = jest.spyOn(FetchForTyne, "fetchForTyne");
beforeEach(() => fetchForTyne.mockResolvedValue({ remoteTyne: MOCK_TYNE }));

jest.mock("../KernelSession", () => ({
  getKernelSession: () => ({
    connect: jest.fn().mockImplementation(() => Promise.resolve()),
    getWidgetRegistry: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ widgets: {} })),
    renameSheet: jest.fn(),
    kernel: {
      requestCommInfo: jest.fn().mockReturnValue({
        content: {
          status: "ok",
          comms: "hi!",
        },
      }),
      registerCommTarget: jest.fn(),
      dispose: jest.fn(),
    },
    ping: jest.fn(),
  }),
}));

// mui-nested-menu test fails without this mock
jest.mock("@mui/material/styles/styled", () => {
  const { styled } = require("@mui/material");
  return styled;
});

test.each<string>(["{Shift>}{Space}{/Shift}", "{Control>}{Space}{/Control}"])(
  "NeptyneContainer reacts to shorctus",
  async (shortcut) => {
    const { queryByTestId, getByTestId } = render(
      <BrowserRouter>
        <NeptyneContainer tyneId="foo" {...COMMON_PROPS} />
      </BrowserRouter>
    );

    // focus on the grid for grid shortcuts to work
    await act(async () => await userEvent.click(getByTestId("cell-0-0")));

    // seing autofill means that a single cell is selected
    expect(queryByTestId("autofill-drag-control")).toBeInTheDocument();

    // this shortcut is supposed to select entire current row
    await act(async () => await userEvent.keyboard(shortcut));

    // since entire row is selected, no autofill should be visible
    expect(queryByTestId("autofill-drag-control")).not.toBeInTheDocument();
  }
);

test.each<string>(["{Shift>}{Space}{/Shift}", "{Control>}{Space}{/Control}"])(
  "NeptyneContainer does not react to sheet shorctus if sheet is not focues",
  async (shortcut) => {
    const { queryByTestId, getByTestId } = render(
      <BrowserRouter>
        <NeptyneContainer tyneId="foo" {...COMMON_PROPS} />
      </BrowserRouter>
    );

    // focus out of the grid to prevent shorctus from working
    await act(async () => await userEvent.click(getByTestId("AdaptiveToolbar")));

    // seing autofill means that a single cell is selected
    expect(queryByTestId("autofill-drag-control")).toBeInTheDocument();

    // this shortcut is supposed to select entire current row, but will not work since grid is
    // out of focus
    await act(async () => await userEvent.keyboard(shortcut));

    // since entire row is selected, no autofill should be visible
    expect(queryByTestId("autofill-drag-control")).toBeInTheDocument();
  }
);

const waitForPageInit = async (
  queryByTestId: (
    id: Matcher,
    options?: MatcherOptions | undefined
  ) => HTMLElement | null
) => {
  // wait for page to load
  await waitFor(async () => queryByTestId("LogoIcon"));
  // wait for autosize grid to appear and to disappear
  await waitFor(async () => {
    queryByTestId("calculator-data-grid-container");
    expect(queryByTestId("calculator-data-grid-container")).not.toBeInTheDocument();
  });
  await waitForElementToBeRemoved(() =>
    queryByTestId("calculator-data-grid-container")
  );
};

test("grid autosizes on long text", async () => {
  const { getByTestId, queryByTestId } = render(
    <BrowserRouter>
      <NeptyneContainer tyneId="foo" {...COMMON_PROPS} />
    </BrowserRouter>
  );

  await waitForPageInit(queryByTestId);

  // ideally we should check that first row is 40px tall - since it is a multiline.
  // But we test that autosizins is applieed it it might be good enough
  expect(getByTestId("cell-0-0")).toHaveStyle("height: 15px");
  expect(getByTestId("cell-0-1")).toHaveStyle("height: 15px");
  expect(getByTestId("cell-1-0")).toHaveStyle("height: 20px");
});

test("grid resets autosize when sheet is changed", async () => {
  const { getByTestId, queryByTestId } = render(
    <BrowserRouter>
      <NeptyneContainer tyneId="foo" {...COMMON_PROPS} />
    </BrowserRouter>
  );

  await waitForPageInit(queryByTestId);

  await waitFor(async () => {
    await userEvent.click(getByTestId("sheet-Sheet1-button"));
    queryByTestId("calculator-data-grid-container");
    expect(queryByTestId("calculator-data-grid-container")).not.toBeInTheDocument();
  });

  expect(getByTestId("cell-0-0")).toHaveStyle("height: 20px");
});

test("Submit sheet name on blur", async () => {
  let kernelSession: KernelSession;

  const { getByTestId, queryByTestId, findByTestId } = render(
    <BrowserRouter>
      <NeptyneContainer
        tyneId="foo"
        onKernelSessionInit={(ks) => {
          kernelSession = ks;
        }}
        {...COMMON_PROPS}
      />
    </BrowserRouter>
  );

  await waitForPageInit(queryByTestId);

  // dnd wrapper of sheets menu takes some time to init
  await waitFor(async () => await findByTestId("sheet-Sheet0"));

  await act(async () => {
    await userEvent.click(getByTestId("cell-0-0"));
    await userEvent.keyboard("{Alt>}HOR{/Alt}", { delay: 10 });
  });

  expect(queryByTestId("sheet-rename-input")).toBeInTheDocument();

  const renameSheet = jest.spyOn(kernelSession!, "renameSheet");

  await act(async () => {
    await userEvent.keyboard("Brand new name", { delay: 10 });

    // blur
    await userEvent.click(getByTestId("AdaptiveToolbar"));
  });

  expect(renameSheet).toHaveBeenCalledWith(0, "Brand new name");
});

test("Submit sheet name on ESC", async () => {
  const { getByTestId, queryByTestId } = render(
    <BrowserRouter>
      <NeptyneContainer tyneId="foo" {...COMMON_PROPS} />
    </BrowserRouter>
  );

  await waitForPageInit(queryByTestId);

  await act(async () => {
    await userEvent.click(getByTestId("cell-0-0"));
    await userEvent.keyboard("{Alt>}HOR{/Alt}", { delay: 10 });
  });

  expect(queryByTestId("sheet-rename-input")).toBeInTheDocument();

  await act(async () => {
    await userEvent.keyboard("Brand new name{Escape}");
  });

  expect(queryByTestId("sheet-rename-input")).not.toBeInTheDocument();

  expect(queryByTestId("sheet-Sheet0")).toBeInTheDocument();
});
