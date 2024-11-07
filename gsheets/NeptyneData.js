function callData_(method, args) {
  return runPy_("__import__('neptyne').data." + method, args);
}

/**
 * Return a table of web search results
 *
 * @param {string} query what to search for
 * @param {int} count how many results to return, defaults to 10
 * @customfunction
 */
function Data_WebSearch(query, count) {
  return callData_("web_search", [query, count]);
}

/**
 * Import a JSON file from the web
 *
 * @param {string} url the URL of the JSON file
 * @customfunction
 */
function Data_JSON(url) {
  return callData_("json", [url]);
}

/**
 * Import a GeoJSON file from the web
 *
 * @param {string} url the URL of the GeoJSON file
 * @customfunction
 */
function Data_GeoJSON(url) {
  return callData_("geojson", [url]);
}

/**
 * Import a CSV file from the web
 *
 * @param {string} url the URL of the CSV file
 * @customfunction
 */
function Data_CSV(url) {
  return callData_("csv", [url]);
}

/**
 * Import an RSS feed from the web
 *
 * @param {string} url the URL of the RSS feed
 * @customfunction
 */
function Data_RSS(url) {
  return callData_("rss", [url]);
}

/**
 * Import a table from the web
 *
 * @param {string} url the URL of the page containing the table
 * @param {int} idx the index of the table on the page, defaults to -1 for the largest table
 * @customfunction
 */
function Data_WebTable(url, idx) {
  const cell_values = Array.prototype.slice.call(arguments, 1);
  return callData_("web_table", [url, ...cell_values]);
}

/**
 * Look up stock quotes
 *
 * @param {string|string[]} symbols the stock symbols to look up
 * @customfunction
 */
function Data_StockLookup(symbols) {
  return callData_("stock_lookup", [symbols]);
}

/**
 * Geocode an address using the Google Maps API
 *
 * @param {string} address the address to geocode
 * @customfunction
 */
function Data_Geocode(address) {
  return callData_("geocode", [address]);
}
