import "../jest-mock-tinygesture";
import "../jestMockCanvas";
import { render } from "@testing-library/react";
import NeptyneNotebook, { CODE_PANEL_CELL_ID, NotebookProps } from "./NeptyneNotebook";
import { useRef } from "react";
import { CodeMirrorApi } from "../codemirror-editor/CodeMirror";
import { AutocompleteResponseItem } from "./NotebookCellEditor/types";
import {
  CellIdPickingContext,
  CellIdPickingStore,
} from "../cell-id-picking/cell-id-picking.store";

const noop = () => {};

const MockNeptyneNotbook = (props: Partial<NotebookProps>) => {
  const replCellRef = useRef<CodeMirrorApi>(null);
  const notebookRef = useRef<CodeMirrorApi>(null);
  return (
    <CellIdPickingContext.Provider value={new CellIdPickingStore()}>
      <NeptyneNotebook
        cells={{}}
        codePanelCell={{
          cell_id: CODE_PANEL_CELL_ID,
          cell_type: "code",
          source: "foo = 1 + 1",
          outputs: [],
          execution_count: 0,
          metadata: {},
        }}
        readOnly={false}
        codeCellChanged={noop}
        onHighlightChange={noop}
        runCodeCell={noop}
        scrollY={0}
        onNotebookScrolled={noop}
        getAutocomplete={() => Promise.resolve({ result: [] })}
        codeEditorWidth={0}
        runRepl={noop}
        handleCellAction={noop}
        replCellRef={replCellRef}
        notebookRef={notebookRef}
        hideRepl={false}
        events={[]}
        thinking={noop}
        hasStreamlit={false}
        displaySnackbar={noop}
        connectToKernel={noop}
        {...props}
      />
    </CellIdPickingContext.Provider>
  );
};

test("NeptyneNotebook renders stuff", () => {
  const { container } = render(<MockNeptyneNotbook />);
  expect(container).toHaveTextContent("foo = 1 + 1");
});

test("NeptyneNotebook draws text decoration", () => {
  const getAutocomplete = jest.fn(() =>
    Promise.resolve({
      result: [
        { detail: "pass", label: "", type: "insertion" },
      ] as AutocompleteResponseItem[],
    })
  );
  const { container, rerender } = render(
    <MockNeptyneNotbook
      codePanelCell={{
        cell_id: CODE_PANEL_CELL_ID,
        cell_type: "code",
        source: "def foo():\n\tpass",
        outputs: [],
        execution_count: 0,
        metadata: {},
      }}
      getAutocomplete={getAutocomplete}
      // for now we check highlight only on rerenders.
      // This is not a big deal with current implementation, but might be something to optimize
      // in the future
      highlight={[{ from: 0, to: 10 }]}
    />
  );

  expect(container.getElementsByClassName("cm-codex").length).toBe(0);

  rerender(
    <MockNeptyneNotbook
      codePanelCell={{
        cell_id: CODE_PANEL_CELL_ID,
        cell_type: "code",
        source: "def foo():\n\tpass",
        outputs: [],
        execution_count: 0,
        metadata: {},
      }}
      getAutocomplete={getAutocomplete}
      // for now we check highlight only on rerenders.
      // This is not a big deal with current implementation, but might be something to optimize
      // in the future
      highlight={[{ from: 4, to: 10 }]}
    />
  );

  expect(container.getElementsByClassName("cm-codex").length).toBe(1);

  rerender(
    <MockNeptyneNotbook
      codePanelCell={{
        cell_id: CODE_PANEL_CELL_ID,
        cell_type: "code",
        source: "def foo():\n\tpass",
        outputs: [],
        execution_count: 0,
        metadata: {},
      }}
      getAutocomplete={getAutocomplete}
      // for now we check highlight only on rerenders.
      // This is not a big deal with current implementation, but might be something to optimize
      // in the future
      highlight={[]}
    />
  );

  expect(container.getElementsByClassName("cm-codex").length).toBe(0);
});
