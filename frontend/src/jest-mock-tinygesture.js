jest.mock("tinygesture", () => {
  return function () {
    return { on: () => {}, destroy: () => {} };
  };
});
