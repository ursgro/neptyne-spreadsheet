const { Py, encodeForPython, getPyFunction_ } = require("./Code");

// Define a hierarchy that mimics the Google Apps Script API:
const activeSheet = {
  getActiveCell: () => ({ getA1Notation: () => "A1" }),
  getSheetId: () => 0,
};
const developerMetaData = [
  {
    getKey: () => "neptyne_code",
    getValue: () => "def hello():\n  return 'Hello, world!'",
  },
  {
    getKey: () => "neptyne_requirements",
    getValue: () => "requests\ntornado\ntoolz",
  },
];

const activeSpreadsheet = {
  getActiveSheet: () => activeSheet,
  getDeveloperMetadata: () => developerMetaData,
  getId: () => "n3pt9n3",
  getOwner: () => ({ getEmail: () => "test@email.com" }),
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: () => activeSpreadsheet,
};

global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (key) => key + ":z0g3h31m",
  }),
};

global.Utilities = {
  base64Decode: (b64string) => Buffer.from(b64string, "base64"),
  newBlob: (data) => ({ getDataAsString: () => data.toString("utf-8") }),
  base64EncodeWebSafe: (data) => Buffer.from(data).toString("base64"),
  computeRsaSha256Signature: (input, secret) => `${input}-${secret}-signature`,
};

global.Session = {
  getActiveUser: () => {
    throw new Error("You don't have access to Session in this context");
  },
};

global.UrlFetchApp = {
  functions: {},
  fetch: (url, options) => {
    const expression = JSON.parse(options.payload).expression;
    const { funcName, argsString } = expression.match(
      /^(?<funcName>[a-zA-Z_]\w*)\((?<argsString>[\s\S]*)\)$/
    ).groups;

    function evalInContext(js) {
      const context = {
        N_: {
          datetime_from_str: (str) => new Date(str),
        },
        CellRange: (r) => r,
      };
      return new Function("with(this) { return " + js + " }").call(context);
    }

    const args = evalInContext(`[${argsString}]`);
    const result = UrlFetchApp.functions[funcName](...args);
    const replaceDates = (value) => {
      if (value instanceof Date) {
        return { type: "date", dateString: value.toISOString() };
      } else if (Array.isArray(value)) {
        return value.map(replaceDates);
      }
      return value;
    };

    return {
      getContentText: () => JSON.stringify(replaceDates(result)),
      getHeaders: () => ({ "Content-Type": "application/json" }),
    };
  },
};

const runAndExpectPyTest = (
  function_name,
  function_definition,
  args,
  expected
) => {
  UrlFetchApp.functions[function_name] = function_definition;
  expect(Py(function_name, ...args)).toEqual(expected);
};

describe("Test the PY mechanism", () => {
  afterEach(() => {
    UrlFetchApp.functions = {};
  });

  it("should run a simple function", () => {
    runAndExpectPyTest("add", (x, y) => x + y, [1, 2], 3);
  });

  it("should run a function that adds a day to a list of dates", () => {
    runAndExpectPyTest(
      "add_days",
      (dates, days) =>
        dates.map((date) => new Date(date.setDate(date.getDate() + days))),
      [[new Date("2020-01-01"), new Date("2020-01-02")], 1],
      [new Date("2020-01-02"), new Date("2020-01-03")]
    );
  });

  it("should run a function that multiplies two matrices", () => {
    runAndExpectPyTest(
      "multiply",
      (a, b) =>
        a.map((row) =>
          row.map((_, i) =>
            row.reduce((sum, _, j) => sum + row[j] * b[j][i], 0)
          )
        ),
      [
        [
          [1, 2],
          [3, 4],
        ],
        [
          [5, 6],
          [7, 8],
        ],
      ],
      [
        [19, 22],
        [43, 50],
      ]
    );
  });
});

describe("Test py function parser", () => {
  it("Should parse a function as a py expression", () => {
    expect(getPyFunction_('=PY("add", 1, 2)')).toEqual("add");
    expect(getPyFunction_('=PY_local("add", 1, 2)')).toEqual("add");
    expect(getPyFunction_(' =  PY (  "add"  ,   1   ,    2  )   ')).toEqual(
      "add"
    );
    expect(getPyFunction_(' = PY_local  (  "add"  ,  1 ,    2)  ')).toEqual(
      "add"
    );
  });
});

describe("encodeForPython", () => {
  it("should encode numbers correctly", () => {
    expect(encodeForPython(42)).toBe("42");
  });

  it("should encode booleans correctly", () => {
    expect(encodeForPython(true)).toBe("True");
    expect(encodeForPython(false)).toBe("False");
  });

  it("should encode strings correctly", () => {
    expect(encodeForPython("hello")).toBe('"hello"');
    expect(encodeForPython('hello"world"')).toBe('"hello\\"world\\""');
  });

  it("should encode arrays correctly", () => {
    expect(encodeForPython([1, 2, 3])).toBe("[1, 2, 3]");
    expect(encodeForPython(["a", "b", "c"])).toBe('["a", "b", "c"]');
  });

  it("should encode null & undefined correctly", () => {
    expect(encodeForPython(undefined)).toBe("None");
    expect(encodeForPython(null)).toBe("None");
  });

  it("should encode dates correctly", () => {
    const date = new Date("2022-01-01T12:00:00Z");
    expect(encodeForPython(date)).toBe(
      'N_.datetime_from_str("2022-01-01T12:00:00.000Z")'
    );
  });

  it("should use N_.from_json for dicts", () => {
    const obj = { key: "value" };
    expect(encodeForPython(obj)).toBe(
      'N_.from_json("{\\"key\\":\\"value\\"}")'
    );
  });
});
