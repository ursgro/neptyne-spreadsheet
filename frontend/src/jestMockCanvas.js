jest.mock("react-markdown", () => ({
  __esModule: true,
  default: "mockedDefaultExport",
}));
jest.mock("micromark-extension-gfm", () => ({
  __esModule: true,
  default: "mockedDefaultExport",
}));
jest.mock("remark-gfm", () => ({
  __esModule: true,
  default: "mockedDefaultExport",
}));
