const SLEEP_DURATION = 500;
const OFFSCREEN_OFFSET = 100000;

function insertImageHandler(spreadsheetId, imageProps) {
  p = JSON.parse(imageProps);
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = getSheetById(ss, p["sheet"]);
  const image = maybeRenderImage_(sheet, p);
  if (p["actionNumber"]) {
    image.assignScript("handleButton" + p["actionNumber"].toString());
  }
}

function getSheetDict_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var sheetDict = {};
  for (var i = 0; i < sheets.length; i++) {
    sheetDict[sheets[i].getSheetId()] = sheets[i];
  }
  return sheetDict;
}

function getSheetById(ss, sheetId) {
  sheets = ss.getSheets();
  for (const sheet of sheets) {
    if (sheet.getSheetId() === sheetId) {
      return sheet;
    }
  }
}

function getImageFromSheet_(sheet, address) {
  var images = sheet.getImages();

  var toReturn = null;
  for (var i = 0; i < images.length; i++) {
    var image = images[i];
    try {
      if (image.getAltTextTitle() === address) {
        if (!toReturn) {
          toReturn = image;
        } else {
          image.remove();
        }
      }
    } catch (error) {
      // Swallow error so future images are always processed.
      console.log("Error cleaning up image:");
      console.log(error);
    }
  }
  return toReturn;
}

function getPyFunction_(formula) {
  if (formula) {
    const m = formula.match(/=\s*(?:Py|Button)(?:_\w+)?\s*\(\s*[\"\'](\w+)/i);
    if (m) {
      return m[1];
    }
  }
  return null;
}

function maybeRenderImage_(sheet, properties) {
  var row = properties["row"] + 1;
  var col = properties["col"] + 1;
  var x_offset = 0;
  var y_offset = 0;
  const cell = sheet.getRange(row, col);
  const formula = cell.getFormula();
  const pyFnName = getPyFunction_(formula);

  if (!pyFnName && !/^=\s*Button\s*\(/i.test(formula)) {
    return;
  }

  const rescale = properties.render_height && properties.render_width;
  const addr = properties["address"];
  const image = getImageFromSheet_(sheet, addr);
  let newImage;
  if (image) {
    if (image.getUrl() !== properties["url"]) {
      x_offset = image.getAnchorCellXOffset();
      y_offset = image.getAnchorCellYOffset();
      if (y_offset === OFFSCREEN_OFFSET) {
        y_offset = 0; // Ensure image is always moved to visibility
      }
      anchor = image.getAnchorCell();
      row = anchor.getRow();
      col = anchor.getColumn();
      newImage = sheet.insertImage(
        properties["url"],
        col,
        row,
        x_offset,
        rescale ? OFFSCREEN_OFFSET : y_offset
      );
      console.log("Image Replacement: Old, New URLs");
      console.log(image.getUrl());
      console.log(newImage.getUrl());
      image.remove();
      Utilities.sleep(SLEEP_DURATION);
      newImage.setAltTextTitle(addr);
    }
  } else {
    newImage = sheet.insertImage(
      properties["url"],
      col,
      row,
      x_offset,
      rescale ? OFFSCREEN_OFFSET : y_offset
    );
    Utilities.sleep(SLEEP_DURATION);
    newImage.setAltTextTitle(addr);
  }
  SpreadsheetApp.flush();

  if (rescale) {
    newImage.setHeight(properties.render_height);
    newImage.setWidth(properties.render_width);
    newImage.setAnchorCellYOffset(y_offset);
    SpreadsheetApp.flush();
  }

  return newImage;
}
