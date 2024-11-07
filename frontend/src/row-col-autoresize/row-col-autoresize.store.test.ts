import "../jest-mock-tinygesture";
import { CellAttribute, Dimension, LineWrap } from "../NeptyneProtocol";
import { RowColAutoresizeStore } from "./row-col-autoresize.store";

test("startClientResizeFromRowIds", () => {
  const store = new RowColAutoresizeStore();
  store.startClientResizeFromRowIds([1, 2, 3]);

  expect(store.isClientResize).toBe(true);
  expect(store.resizeDimension).toBe(Dimension.Row);
  expect(store.resizeIndices).toEqual([1, 2, 3]);
});

test("startClientResizeFromRowIds with duplicates", () => {
  const store = new RowColAutoresizeStore();
  store.startClientResizeFromRowIds([1, 1, 2, 3]);

  expect(store.isClientResize).toBe(true);
  expect(store.resizeDimension).toBe(Dimension.Row);
  expect(store.resizeIndices).toEqual([1, 2, 3]);
});

test("startClientResizeFromRowIds with existing values", () => {
  const store = new RowColAutoresizeStore();
  store.setClientRowSizes({ 4: 80 });
  store.startClientResizeFromRowIds([1, 2, 3]);

  expect(store.isClientResize).toBe(true);
  expect(store.resizeDimension).toBe(Dimension.Row);
  expect(store.resizeIndices).toEqual([1, 2, 3, 4]);
});

test("startClientResizeFromRowIds and finish", () => {
  const store = new RowColAutoresizeStore();
  store.startClientResizeFromRowIds([1, 2, 3]);

  store.finishResize();

  expect(store.isClientResize).toBe(undefined);
  expect(store.resizeDimension).toBe(undefined);
  expect(store.resizeIndices).toEqual([]);
});

test("startFullClientResize with no autosize cells", () => {
  const store = new RowColAutoresizeStore();
  store.startFullClientResize([[{ value: "foo", expression: "foo" }]]);

  expect(store.isClientResize).toBe(true);
  expect(store.resizeDimension).toBe(Dimension.Row);
  expect(store.resizeIndices).toEqual([]);
});

test("startFullClientResize with autosize cells", () => {
  const store = new RowColAutoresizeStore();
  store.startFullClientResize([
    [
      {
        value: "foo",
        expression: "foo",
        attributes: { [CellAttribute.LineWrap]: LineWrap.Wrap },
      },
    ],
  ]);

  expect(store.isClientResize).toBe(true);
  expect(store.resizeDimension).toBe(Dimension.Row);
  expect(store.resizeIndices).toEqual([0]);
});
