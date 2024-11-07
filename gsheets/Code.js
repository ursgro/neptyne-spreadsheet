const BETA_FLAG = "beta-features";

function createNeptyneToken() {
  const scriptSecret =
    PropertiesService.getScriptProperties().getProperty("shared_secret");
  const docSecret = getDeveloperMetadata_("shared_secret");

  const isRS256 = !docSecret;
  const secret = isRS256 ? scriptSecret : docSecret;

  const header = {
    alg: isRS256 ? "RS256" : "HS256",
    typ: "JWT",
  };

  console.log("header", header, "docsecret", docSecret);

  const sheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
  const issuedAt = Math.floor(new Date().getTime() / 1000);

  let userEmail;
  try {
    userEmail = Session.getActiveUser().getEmail();
  } catch (e) {
    userEmail = undefined;
  }

  const owner = SpreadsheetApp.getActiveSpreadsheet().getOwner();
  const ownerEmail = owner ? owner.getEmail() : null;

  const payload = {
    sheetId,
    userEmail,
    ownerEmail,
    tyneFileName: getTyneFileName_(),
    iat: issuedAt,
    exp: issuedAt + 3600,
  };

  const base64Header = Utilities.base64EncodeWebSafe(JSON.stringify(header));
  const base64Payload = Utilities.base64EncodeWebSafe(JSON.stringify(payload));
  const signatureInput = base64Header + "." + base64Payload;

  let signatureBytes;
  if (isRS256) {
    const rsaSecret = Utilities.newBlob(
      Utilities.base64Decode(secret)
    ).getDataAsString();
    signatureBytes = Utilities.computeRsaSha256Signature(
      signatureInput,
      rsaSecret
    );
  } else {
    signatureBytes = Utilities.computeHmacSha256Signature(
      signatureInput,
      secret
    );
  }

  const base64Signature = Utilities.base64EncodeWebSafe(signatureBytes);
  return signatureInput + "." + base64Signature;
}

function getResearchMetadata_(sheetId) {
  const sheet = getSheet(sheetId);
  const metadata = sheet.getDeveloperMetadata();
  const researchMetadata = metadata.filter(
    (m) => m.getKey() === "neptyne_research_metadata"
  );
  if (researchMetadata.length === 0) {
    return null;
  }

  const range = sheet.getActiveRange();

  const items = JSON.parse(researchMetadata[0].getValue());

  let closest = items[0];
  let closestDistance =
    Math.abs(items[0].row - range.getRow()) +
    Math.abs(items[0].col - range.getColumn());
  for (let i = 1; i < metadata.length; i++) {
    const distance =
      Math.abs(items[i].row - range.getRow()) +
      Math.abs(items[i].col - range.getColumn());
    if (distance < closestDistance) {
      closest = items[i];
    }
  }
  console.log(
    "closest:",
    closest.table.start.row,
    closest.table.start.col,
    closest.table.end.row,
    closest.table.end.col,
    closest.prompt
  );
  return closest;
}

function updateResearchMetaData(sheetId, newValue, previousValue) {
  const sheet = getSheet(sheetId);
  const existingMetadata = sheet.getDeveloperMetadata();
  const researchMetadata = existingMetadata.filter(
    (m) => m.getKey() === "neptyne_research_metadata"
  );
  if (researchMetadata.length === 0) {
    sheet.addDeveloperMetadata(
      "neptyne_research_metadata",
      JSON.stringify([newValue])
    );
  } else {
    const metadata = JSON.parse(researchMetadata[0].getValue());
    for (let i = 0; i < metadata.length; i++) {
      if (
        metadata[i].table.start.row === previousValue.table.start.row &&
        metadata[i].table.start.col === previousValue.table.start.col
      ) {
        metadata[i] = newValue;
        break;
      }
    }
    researchMetadata[0].setValue(JSON.stringify(metadata));
  }
}

function getAppConfig_(gsWidgetMode) {
  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  // If the active user is not the effective user, this is an onOpen trigger
  // called by someone else. In this case, we should not send auth tokens.
  let shouldSendAuthTokens = false;
  try {
    shouldSendAuthTokens =
      !!Session.getEffectiveUser().getEmail() &&
      Session.getEffectiveUser().getEmail() ===
        Session.getActiveUser().getEmail();
  } catch (e) {}

  const payload = {
    inGSMode: true,
    serverUrlBase: getServerUrlBase_(),
    gsheetId: activeSpreadsheet.getId(),
    gsheetName: activeSpreadsheet.getName(),
    gsheetLocale: activeSpreadsheet.getSpreadsheetLocale(),
    gsheetTimeZone: activeSpreadsheet.getSpreadsheetTimeZone(),
    projectId: getProjectId_(),
    gsWidgetMode: gsWidgetMode,
    authToken: createNeptyneToken(),
    gsheetFunctionHintsHiddenLevel: getGSheetFunctionHintsHiddenLevel(),
    poppedOut: false,
    scriptCodeSHA: "__GIT_REF__",
    activeSheetId: activeSpreadsheet.getActiveSheet().getSheetId(),
    oidcToken: shouldSendAuthTokens ? ScriptApp.getIdentityToken() : null,
    sharedSecret: getDeveloperMetadata_("shared_secret"),
  };
  if (gsWidgetMode === "research-panel") {
    let researchMetadata = getResearchMetadata_();
    if (!researchMetadata) {
      const selection = activeSpreadsheet.getActiveSheet().getActiveRange();
      researchMetadata = {
        prompt: "",
        table: {
          start: {
            row: selection.getRow() - 1,
            col: selection.getColumn() - 1,
          },
          end: {
            row: selection.getRow() + selection.getNumRows() - 1,
            col: selection.getColumn() + selection.getNumColumns() - 1,
          },
        },
      };
    }
    payload["researchMetadata"] = researchMetadata;
  } else if (gsWidgetMode === "organization-billing") {
    const metadata = getTyneMetadata_();
    payload["ownerEmail"] = metadata["owner_email"];
  }
  return JSON.stringify(payload);
}

function getServerUrlBase_() {
  const serverUrlBase = getDeveloperMetadata_("server_url_base");
  if (serverUrlBase) {
    return serverUrlBase;
  }
  return PropertiesService.getScriptProperties().getProperty("server_url_base");
}

function getProjectId_() {
  return PropertiesService.getScriptProperties().getProperty("project_id");
}

function hideGSheetFunctionHints(which) {
  PropertiesService.getUserProperties().setProperty(
    "hide_function_hints",
    which
  );
}

function enableBetaFeaturesLDBP() {
  // random.sample(string.ascii_uppercase, 4) to make this less obvious to guess :)
  PropertiesService.getDocumentProperties().setProperty(BETA_FLAG, true);
}

function disableBetaFeaturesHKEI() {
  PropertiesService.getDocumentProperties().deleteProperty(BETA_FLAG);
}

function betaFeatures_() {
  try {
    return !!PropertiesService.getDocumentProperties().getProperty(BETA_FLAG);
  } catch (e) {
    return false;
  }
}

function getGSheetFunctionHintsHiddenLevel() {
  const preference = PropertiesService.getUserProperties().getProperty(
    "hide_function_hints"
  );
  if (!preference) {
    // It's important to return null here, because "false" or "0" will
    // become strings in the evaluated template
    return null;
  }
  return preference;
}

function postToServer_(url, payload) {
  var options = {
    headers: {
      "ngrok-skip-browser-warning": "true",
      "x-neptyne-project-id": getProjectId_(),
    },
    method: "POST",
    payload: JSON.stringify(payload),
    contentType: "application/json",
  };

  return UrlFetchApp.fetch(url, options);
}

function upsertDeveloperMetadata_(key, value) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const metadata = ss.getDeveloperMetadata();
  let existingMetadata = null;

  for (let i = 0; i < metadata.length; i++) {
    if (metadata[i].getKey() === key) {
      existingMetadata = metadata[i];
      break;
    }
  }

  if (existingMetadata === null) {
    ss.addDeveloperMetadata(key, value);
  } else if (existingMetadata.getValue() !== value) {
    existingMetadata.setValue(value);
  }
}

function getDeveloperMetadata_(key) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const metadata = ss.getDeveloperMetadata();

  for (let i = 0; i < metadata.length; i++) {
    if (metadata[i].getKey() === key) {
      return metadata[i].getValue();
    }
  }

  return null;
}

function onOpen() {
  const menu = SpreadsheetApp.getUi()
    .createMenu("Neptyne")
    .addItem("📝 Show Code Editor", "showCodeEditor")
    .addItem("📦 Install Python Packages", "showPackageManagement")
    .addItem("🔐 Manage Secrets", "showSecretsManagement");

  if (betaFeatures_()) {
    menu
      .addItem("🔬 AI Research", "showResearchPanel_")
      .addItem("💳 Billing", "showOrganizationPayment_");
  }

  menu
    .addItem("📊 Streamlit", "showStreamlit")
    .addItem("🚀️ Manage Advanced Features", "showAdvancedFeatures")
    .addItem("🔧 Custom Server Config", "showServerConfigForm")
    .addItem("📚 Tutorial", "showTutorial")
    .addToUi();
}

function onInstall(e) {
  console.log("on_install");
  onOpen(e);
  showTutorial();
  showCodeEditor();
}

const INSTALLED_TRIGGER_IDENT_CACHE_KEY = "installed_trigger_ident";

function onOpenInstalledTrigger() {
  // Note: this is called once for every installed trigger, i.e. once
  // for every user who has opened the code panel. We do our best here
  // return early when it seems you'd run it multiple times, but it's
  // best not to have any side effects in this function.

  const effectiveUser = Session.getEffectiveUser().getEmail();
  const cache = CacheService.getDocumentCache();

  let installedTriggerIdent = cache.get(INSTALLED_TRIGGER_IDENT_CACHE_KEY);
  if (installedTriggerIdent == null) {
    const lock = LockService.getDocumentLock();
    try {
      if (lock.tryLock(3000)) {
        installedTriggerIdent = cache.get(INSTALLED_TRIGGER_IDENT_CACHE_KEY);
        if (installedTriggerIdent == null) {
          cache.put(INSTALLED_TRIGGER_IDENT_CACHE_KEY, effectiveUser, 3600);
          installedTriggerIdent = effectiveUser;
        }
      } else {
        console.log("Failed to acquire lock");
      }
    } finally {
      lock.releaseLock();
    }
  }

  console.log("ident", installedTriggerIdent, effectiveUser);

  if (
    installedTriggerIdent !== null &&
    installedTriggerIdent !== effectiveUser
  ) {
    console.log("skipping trigger");
    return;
  }

  const start = new Date();
  const metadata = getTyneMetadata_();
  if (metadata.streamlit && metadata.streamlit.auto_open) {
    showStreamlit();
    console.log(
      "Time to open streamlit from trigger: " + (new Date() - start) + "ms"
    );
  }
}

function installTrigger_() {
  const handlerFn = "onOpenInstalledTrigger";
  const hasTrigger = ScriptApp.getUserTriggers(SpreadsheetApp.getActive()).some(
    (trigger) => trigger.getHandlerFunction() === handlerFn
  );
  if (!hasTrigger) {
    const builder = ScriptApp.newTrigger(handlerFn)
      .forSpreadsheet(SpreadsheetApp.getActive())
      .onOpen();

    try {
      builder.create();
    } catch (e) {
      // If >1 executions race here and both try to create a trigger, all but one
      // will fail.
      console.log("Failed to create trigger:", e);
    }
  }
}

// Called from the app when opening the editor in separate window:
function fetchOidcToken() {
  return ScriptApp.getIdentityToken();
}

function getTyneMetadata_() {
  const payload = {
    token: createNeptyneToken(),
    oidcToken: ScriptApp.getIdentityToken(),
  };
  try {
    const response = UrlFetchApp.fetch(
      getServerUrlBase_() + "/api/get_connected_tyne_metadata",
      { payload }
    );
    return JSON.parse(response.getContentText());
  } catch (e) {
    console.error("Error fetching Tyne metadata:", e);
    return {};
  }
}

function syncTyneMetadata() {
  const tyneFileName = getTyneMetadata_().tyne_file_name;
  if (tyneFileName) {
    setTyneFileName_(tyneFileName);
  }
}

function showEnvironmentVariables() {
  openNeptyneApp_("Environment Variables", "environment-variables");
}

function setTyneFileName_(tyneFileName) {
  upsertDeveloperMetadata_("neptyne_tyne_file_name", tyneFileName);
}

function showCodeEditor() {
  openNeptyneApp_("Neptyne");
}

function showPackageManagement() {
  openNeptyneApp_("Python Packages", "package-management");
}

function showSecretsManagement() {
  openNeptyneApp_("Secrets", "secrets-management");
}

function showResearchPanel_() {
  _expandCurrentSelection();
  openNeptyneApp_("AI Research", "research-panel");
}

function showAdvancedFeatures() {
  openNeptyneApp_("Advanced Features", "advanced-features");
}

function showTutorial() {
  openNeptyneApp_("Tutorial", "tutorial");
}

function showServerConfigForm() {
  const serverUrl = getDeveloperMetadata_("server_url_base") || "";
  const sharedSecret = getDeveloperMetadata_("shared_secret") || "";
  const isCustom = serverUrl || sharedSecret;

  const ui = SpreadsheetApp.getUi();
  const html = `
    <style>
      body {
        font-family: Arial, sans-serif;
        width: 300px;
        padding: 20px;
        box-sizing: border-box;
      }
      h2 {
        font-size: 16px;
        color: #333;
        margin-bottom: 15px;
      }
      label {
        display: block;
        margin-bottom: 10px;
        font-size: 13px;
      }
      input[type="text"] {
        width: calc(100% - 10px);
        padding: 8px;
        margin-top: 5px;
        font-size: 12px;
        border: 1px solid #ccc;
        border-radius: 3px;
        box-sizing: border-box;
      }
      #configForm {
        display: flex;
        flex-direction: column;
        min-height: 200px;
      }
      #buttons {
        margin-top: auto;
        display: flex;
        justify-content: space-between;
        margin-top: 20px;
      }
      #customFields {
        margin-top: 15px;
        display: ${isCustom ? "block" : "none"};
      }
      button {
        padding: 8px 16px;
        font-size: 12px;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        background-color: #4285F4;
        color: #fff;
      }
      button:hover {
        background-color: #357AE8;
      }
    </style>
    <form id="configForm">
      <h2>Configure Server Settings</h2>
      <label>
        <input type="radio" name="mode" value="default" ${
          isCustom ? "" : "checked"
        }> Default
      </label>
      <label>
        <input type="radio" name="mode" value="custom" ${
          isCustom ? "checked" : ""
        }> Custom
      </label>
      <div id="customFields">
        <label>Server URL Base:
          <input type="text" id="serverUrl" value="${serverUrl}">
        </label>
        <label>Shared Secret:
          <input type="text" id="sharedSecret" value="${sharedSecret}">
        </label>
      </div>
      <div id="buttons">
        <button type="button" onclick="saveConfig()">Save</button>
        <button type="button" onclick="google.script.host.close()">Cancel</button>
      </div>
    </form>
    <script>
      document.querySelectorAll('input[name="mode"]').forEach(input => {
        input.addEventListener("change", () => {
          document.getElementById("customFields").style.display =
            input.value === "custom" ? "block" : "none";
        });
      });

      function saveConfig() {
        const mode = document.querySelector('input[name="mode"]:checked').value;
        const serverUrl = document.getElementById("serverUrl").value || "";
        const sharedSecret = document.getElementById("sharedSecret").value || "";
        google.script.run.updateServerInfo(
          mode === "default" ? "" : serverUrl,
          mode === "default" ? "" : sharedSecret
        );
        google.script.host.close();
      }
    </script>
  `;
  ui.showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(350).setHeight(420),
    "Server Configuration"
  );
}

function showStreamlit() {
  const metadata = getTyneMetadata_();

  if (needtoPay_(metadata)) {
    return;
  }

  const url = getServerUrlBase_();
  const options = {
    headers: {
      "ngrok-skip-browser-warning": "true",
      "X-Neptyne-Token": createNeptyneToken(),
    },
  };
  const response = UrlFetchApp.fetch(
    url + "/apps/" + SpreadsheetApp.getActiveSpreadsheet().getId() + "/",
    options
  );
  const content = response.getContentText();

  const template = HtmlService.createTemplate(content);

  template.gsheetAppConfig = getAppConfig_("streamlit");
  const streamlitMetaData = metadata.streamlit || {};
  const title =
    Object.keys(streamlitMetaData).length === 0
      ? "Streamlit in Neptyne"
      : streamlitMetaData.windowCaption;

  const widget = template
    .evaluate()
    .setTitle(maybeAddTrialDaysLeft_(title, metadata))
    .setWidth(streamlitMetaData.width || 640)
    .setHeight(streamlitMetaData.height || 480);

  const ui = SpreadsheetApp.getUi();
  if (streamlitMetaData.sidebar) {
    ui.showSidebar(widget);
  } else {
    ui.showModelessDialog(widget, title || " ");
  }
}

function maybeAddTrialDaysLeft_(title, metadata) {
  if (metadata.trial_days_left) {
    title += ` (Trial: ${metadata.trial_days_left} days left)`;
  }
  return title;
}

function needtoPay_(metadata) {
  return metadata.subscription_type === "not_subscribed";
}

function openNeptyneApp_(title, widgetMode) {
  const url = getServerUrlBase_();
  const options = {
    headers: {
      "ngrok-skip-browser-warning": "true",
    },
  };

  const metadata = getTyneMetadata_();
  if (needtoPay_(metadata) && widgetMode !== "organization-billing") {
    showOrganizationPayment_();
    return;
  }
  title = maybeAddTrialDaysLeft_(title, metadata);

  const response = UrlFetchApp.fetch(url + "/-/", options);
  const neptyneHomePage = response.getContentText();

  const content = neptyneHomePage
    .replaceAll(' src="/', ' src="' + url + "/")
    .replaceAll(' href="/', ' href="' + url + "/");

  const template = HtmlService.createTemplate(content);
  template.gsWidgetMode = widgetMode;
  const widget = template.evaluate();

  const neptyneEnv = "__NEPTYNE_ENV__";
  if (neptyneEnv !== "prod") {
    title +=
      " (" + neptyneEnv.toUpperCase().replace("__NEPTYNE_ENV__", "LOCAL") + ")";
  }
  widget.setTitle(title).setWidth(640).setHeight(480);

  const modeless = [
    "tutorial",
    "organization-billing",
    "environment-variables",
  ].includes(widgetMode);
  const sidebar = ["research-panel", undefined].includes(widgetMode);

  if (modeless) {
    SpreadsheetApp.getUi().showModelessDialog(widget, title);
  } else if (sidebar) {
    SpreadsheetApp.getUi().showSidebar(widget);
  } else {
    SpreadsheetApp.getUi().showModalDialog(widget, title);
  }

  installTrigger_();
}

function showOrganizationPayment_() {
  openNeptyneApp_("Billing", "organization-billing");
}

function getPyFunction_(formula) {
  if (formula) {
    var m = formula.match(/=\s*Py(?:_\w+)?\s*\(\s*[\"\'](\w+)/i);
    if (m) {
      return m[1];
    }
  }
  return null;
}

function rerunChangedFunctions(functionNames) {
  console.log("rerun_functions: " + functionNames.join(", "));
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  var allCells = sheet.getRange(1, 1, lastRow, lastColumn);
  var allFormulas = allCells.getFormulas();
  var changedCells = [];
  allFormulas.map((row, y) => {
    row.map((formula, x) => {
      if (formula) {
        var pyFnName = getPyFunction_(formula);
        if (functionNames.includes(pyFnName)) {
          var cell = sheet.getRange(y + 1, x + 1);
          cell.setValue(cell.getValue());
          changedCells.push([cell, formula]);
        }
      }
    });
  });

  SpreadsheetApp.flush();

  for (var cell_and_formula of changedCells) {
    var cell = cell_and_formula[0];
    var formula = cell_and_formula[1];
    cell.setFormula(formula);
  }

  SpreadsheetApp.flush();
}

function getNeptyneCode_() {
  return getDeveloperMetadata_("neptyne_code");
}

function getNeptyneRequirements_() {
  return getDeveloperMetadata_("neptyne_requirements");
}

function getTyneFileName_() {
  return getDeveloperMetadata_("neptyne_tyne_file_name");
}

function decodeDates(input) {
  if (Array.isArray(input)) {
    return input.map(decodeDates);
  } else if (input && typeof input === "object" && input.type === "date") {
    return new Date(input.dateString);
  } else {
    return input;
  }
}

function encodeForPython(input) {
  if (Array.isArray(input)) {
    return "[" + input.map(encodeForPython).join(", ") + "]";
  } else if (typeof input === "number") {
    return input.toString();
  } else if (typeof input === "boolean") {
    return input ? "True" : "False";
  } else if (input instanceof Date) {
    return `N_.datetime_from_str("${input.toISOString()}")`;
  } else if (typeof input === "string") {
    return JSON.stringify(input);
  } else if (input === null || input === undefined) {
    return "None";
  } else {
    return `N_.from_json(${JSON.stringify(JSON.stringify(input))})`;
  }
}

function showError(msg) {
  const ui = SpreadsheetApp.getUi();
  ui.alert("Error", msg, ui.ButtonSet.OK);
}

function updateCellValues(cellChanges, sheetId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheetId != null && sheet.getSheetId() !== sheetId) {
    return;
  }
  cellChanges.forEach((change) => {
    const cell = sheet.getRange(change.row + 1, change.col + 1);
    cell.setValue(change.value);
  });
}

function updateServerInfo(serverUrl, sharedSecret) {
  upsertDeveloperMetadata_("server_url_base", serverUrl);
  upsertDeveloperMetadata_("shared_secret", sharedSecret);
}

function ai_sources() {
  return [...arguments].join(", ");
}

function maybeTruncate_(input) {
  if (input.length > 200) {
    return input.substring(0, 200) + "...";
  } else {
    return input;
  }
}

function runPy_(expression, params, options = undefined) {
  if (expression.trim().startsWith("#NAME?")) {
    throw_error_(
      "You need to put the name of the function you want to call in quotes:" +
        '\n\n=Py("my_function", A1, B2:B7)',
      1
    );
  }

  var gotLoading = false;
  var gotError = false;
  if (params.length > 0) {
    var paramsEncoded = params.map(function (param) {
      if (Array.isArray(param)) {
        if (Array.isArray(param[0])) {
          if (param.length === 1) {
            param = param[0];
          } else if (param[0].length === 1) {
            param = param.map(function (innerArr) {
              return innerArr[0];
            });
          }
        }
        return "CellRange(" + encodeForPython(param) + ")";
      } else {
        if (param === "Loading...") {
          gotLoading = true;
        } else if (param === "#ERROR!") {
          gotError = true;
        }
        return encodeForPython(param);
      }
    });
    expression = expression + "(" + paramsEncoded.join(",") + ")";
  }
  if (!options) {
    options = {};
  }

  if (gotLoading) {
    return "Loading...";
  }
  if (gotError) {
    throw_error_("One of the inputs contains an #ERROR!", 1);
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var cell = sheet.getActiveCell();

  const tyneFileName = getTyneFileName_();
  var payload = {
    cell: cell.getA1Notation(),
    sheet: sheet.getSheetId(),
    expression: expression,
    token: createNeptyneToken(),
    noCache: options.noCache,
    source: options.source || "formula",
  };

  console.log("run: Py(" + maybeTruncate_(expression) + ")");

  var response = postToServer_(
    getServerUrlBase_() + "/api/v1/gsheet_handler",
    payload
  );
  payload = JSON.parse(response.getContentText());
  const headers = response.getHeaders();
  var contentType = headers["Content-Type"];
  if (contentType === "application/vnd.neptyne.error+json") {
    throw_error_(payload.message, payload.line);
  }
  const serverFileName = headers["X-Neptyne-Tyne-File-Name"];
  if (serverFileName && serverFileName !== tyneFileName) {
    setTyneFileName_(serverFileName);
  }
  return decodeDates(payload);
}

/**
 * Executes a Python function.
 *
 * @param {"my_function"} method - The name of the Python method to execute.
 * @param {A1, B2:B7} [...params] - Zero or more parameters to pass to the Python method.
 *
 * @customfunction
 */
function Py(method, ...params) {
  if (!method) {
    throw_error_("The 'method' argument is required.", 1);
  }
  const py_args = Array.prototype.slice.call(arguments, 1);
  return runPy_(method, py_args);
}

function getSheet(sheetId) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (sheetId === undefined) {
    return spreadsheet.getActiveSheet();
  }
  const sheets = spreadsheet.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === sheetId) {
      return sheets[i];
    }
  }
  throw new Error("Sheet with provided ID not found");
}

function fetchGrid(sheetId) {
  const sheet = getSheet(sheetId);

  const activeRange = sheet.getActiveRange();

  let range;

  if (activeRange) {
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    const startRow = activeRange.getRow();
    const startColumn = activeRange.getColumn();
    range = sheet.getRange(
      startRow,
      startColumn,
      lastRow - startRow + 1,
      lastColumn - startColumn + 1
    );
  } else {
    range = sheet.getDataRange();
  }

  const values = range.getValues();

  const grid = values.map((row) =>
    row.map((cellValue) => ({ value: cellValue.toString() }))
  );

  const selectionWidth = activeRange ? activeRange.getWidth() : 1;
  const selectionHeight = activeRange ? activeRange.getHeight() : 1;

  return { grid, selectionWidth, selectionHeight };
}

function updateSheetSelection(sheetId, selection) {
  const sheet = getSheet(sheetId);

  const range = sheet.getRange(
    selection.row + 1,
    selection.col + 1,
    selection.height,
    selection.width
  );
  range.activate();
}

function _expandCurrentSelection() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const range = sheet.getActiveRange();

  const metadata = getResearchMetadata_(sheet.getSheetId());
  if (metadata) {
    sheet.setActiveRange(
      sheet.getRange(
        metadata.table.start.row + 1,
        metadata.table.start.col + 1,
        metadata.table.end.row - metadata.table.start.row + 1,
        metadata.table.end.col - metadata.table.start.col + 1
      )
    );
    return;
  }

  const grid = sheet.getDataRange().getValues();

  if (range.getNumRows() > 1 || range.getNumColumns() > 1) {
    return;
  }
  const start = { row: range.getRow() - 1, col: range.getColumn() - 1 }; // Zero-based index

  const isEmpty = (row, col) => {
    if (row < 0 || col < 0 || row >= grid.length || col >= grid[0].length) {
      return true;
    }
    return grid[row][col] === "" || grid[row][col] === null;
  };

  const move = (dx, dy, point) => {
    let { row, col } = point;
    while (!isEmpty(row + dy, col + dx)) {
      row += dy;
      col += dx;
    }
    return { row, col };
  };

  const up = move(0, -1, start);
  const down = move(0, 1, start);
  const left = move(-1, 0, up);
  const right = move(1, 0, up);

  // Convert back to 1-based index and select the expanded range
  sheet.setActiveRange(
    sheet.getRange(
      up.row + 1,
      left.col + 1,
      down.row - up.row + 1,
      right.col - left.col + 1
    )
  );
}

function getSheetData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  return { values: sheet.getDataRange().getValues(), name: sheet.getName() };
}

function Py_LOCAL(expression) {
  // This creates an environment-specific alias to make things easier when
  // you have multiple versions of the extension installed.
  return runPy_(expression, Array.prototype.slice.call(arguments, 1));
}

if (typeof module !== "undefined") {
  module.exports = { Py, encodeForPython, getPyFunction_ };
}
