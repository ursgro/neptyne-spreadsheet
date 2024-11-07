import "./jest-mock-tinygesture";

Object.defineProperty(URL, "createObjectURL", {
  writable: true,
  value: jest.fn(),
});

Object.assign(global.navigator, {
  clipboard: {
    readText: () => Promise.resolve("jest rocks!"),
    read: () =>
      Promise.resolve([
        {
          types: ["text/plain"],
          getType: () =>
            Promise.resolve({ text: () => Promise.resolve("jest rocks!") }),
        },
      ]),
  },
});

class MockClipboardEvent {
  preventDefault = jest.fn();
  clipboardData = {
    setData: jest.fn(),
    getData: jest.fn(),
  };
}

global.ClipboardEvent = MockClipboardEvent;
