import { getColumnHeader, getRowHeader, newTyne } from "../testing";

describe("handles resizes", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  it("handles resizes", () => {
    getColumnHeader(cy, "B").find(".react-draggable").move({
      deltaX: 200,
      deltaY: 5,
      force: true,
    });
    getColumnHeader(cy, "B").invoke("width").should("be.gt", 250);
    getColumnHeader(cy, "C").find(".react-draggable").move({
      deltaX: -80,
      deltaY: 5,
      force: true,
    });
    getColumnHeader(cy, "C").invoke("width").should("be.lt", 20);
    getRowHeader(cy, "3").find(".react-draggable").move({
      deltaX: 5,
      deltaY: 100,
      force: true,
    });
    getRowHeader(cy, "3").invoke("height").should("be.gt", 115);
    getRowHeader(cy, "2").find(".react-draggable").move({
      deltaX: 5,
      deltaY: -5,
      force: true,
    });
    getRowHeader(cy, "2").invoke("height").should("be.lt", 20);
  });
});
