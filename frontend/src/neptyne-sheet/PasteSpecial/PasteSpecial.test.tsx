// @ts-nocheck
import { FunctionComponent } from "react";
import {
  PasteSpecialContext,
  PasteSpecialStore,
  PasteType,
} from "./paste-special.store";
import { PasteSpecial } from "./PasteSpecial";
import { act, render } from "@testing-library/react";
import { CellAttribute } from "../../NeptyneProtocol";
import { GridElement } from "../../SheetUtils";

interface MockedPasteSpecialProps {
  pasteSpecialStore: PasteSpecialStore;
}

const MockedPasteSpecial: FunctionComponent<MockedPasteSpecialProps> = ({
  pasteSpecialStore,
}) => (
  <PasteSpecialContext.Provider value={pasteSpecialStore}>
    <PasteSpecial frozenColsCount={0} frozenRowsCount={0} overlayPosition="main" />
  </PasteSpecialContext.Provider>
);

test("paste special tooltip does not appear with plaintext content", () => {
  const pasteSpecialStore = new PasteSpecialStore();
  const { queryByTestId } = render(
    <MockedPasteSpecial pasteSpecialStore={pasteSpecialStore} />
  );

  pasteSpecialStore.startPasteSpecial(
    { x: 0, y: 0 },
    [[{ value: "", expression: "" }]],
    [[{ value: "1", expression: "1" }]],
    { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
    () => {}
  );

  expect(queryByTestId("paste-special-btn")).not.toBeInTheDocument();
});

test("paste special tooltip appears with rich content", () => {
  const pasteSpecialStore = new PasteSpecialStore();
  const { queryByTestId } = render(
    <MockedPasteSpecial pasteSpecialStore={pasteSpecialStore} />
  );

  act(() => {
    pasteSpecialStore.startPasteSpecial(
      { x: 0, y: 0 },
      [[{ value: "", expression: "" }]],
      [
        [
          {
            value: "1",
            expression: "1",
            attributes: { [CellAttribute.Color]: "green" },
          },
        ],
      ],
      { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      () => {}
    );
  });

  expect(queryByTestId("paste-special-btn")).toBeInTheDocument();
});

test("paste special runs callback", () => {
  const pasteSpecialStore = new PasteSpecialStore();

  const handlePaste = jest.fn();

  pasteSpecialStore.startPasteSpecial(
    { x: 0, y: 0 },
    [[{ value: "", expression: "" }]],
    [[{ value: "1", expression: "1", attributes: { [CellAttribute.Color]: "green" } }]],
    { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
    handlePaste
  );

  expect(handlePaste).not.toHaveBeenCalled();

  pasteSpecialStore.applyPasteSpecial("format" as PasteType);

  expect(handlePaste).toHaveBeenCalled();
});

test.each<[GridElement[][], GridElement[][], PasteType, GridElement[][]]>([
  [
    [[{ value: "1", expression: "1" }]],
    [[{ value: "2", expression: "2", attributes: { [CellAttribute.Color]: "green" } }]],
    "all" as PasteType,
    [[{ value: "2", expression: "2", attributes: { [CellAttribute.Color]: "green" } }]],
  ],
  [
    [[{ value: "1", expression: "1" }]],
    [[{ value: "2", expression: "2", attributes: { [CellAttribute.Color]: "green" } }]],
    "format" as PasteType,
    [[{ value: "1", expression: "1", attributes: { [CellAttribute.Color]: "green" } }]],
  ],
  [
    [[{ value: "1", expression: "1" }]],
    [[{ value: "2", expression: "2", attributes: { [CellAttribute.Color]: "green" } }]],
    "value" as PasteType,
    [[{ value: "2", expression: "2", attributes: { [CellAttribute.Color]: null } }]],
  ],
  [
    [[{ value: "", expression: "" }]],
    [
      [
        {
          value: "2",
          expression: "=A1",
          attributes: { [CellAttribute.Color]: "green" },
        },
      ],
    ],
    "value" as PasteType,
    [[{ value: "2", expression: "2", attributes: { [CellAttribute.Color]: null } }]],
  ],
])(
  "paste special generates specific cells",
  (originalCells, pastedCells, pasteFormat, resultingCells) => {
    const pasteSpecialStore = new PasteSpecialStore();

    const handlePaste = jest.fn();

    pasteSpecialStore.startPasteSpecial(
      { x: 0, y: 0 },
      originalCells,
      pastedCells,
      { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      handlePaste
    );

    expect(handlePaste).not.toHaveBeenCalled();

    pasteSpecialStore.applyPasteSpecial(pasteFormat);

    expect(handlePaste).toHaveBeenCalledWith(resultingCells, {
      start: { row: 0, col: 0 },
      end: { row: 0, col: 0 },
    });
  }
);
