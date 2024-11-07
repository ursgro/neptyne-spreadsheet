function callAI_(method, args) {
  return runPy_("__import__('neptyne').ai." + method, args);
}

/**
 * Return a value matching the query using AI
 *
 * @param {string} query what to ask the AI
 * @param {B2} cells the query optionally refers to
 * @customfunction
 */
function AI_Value(query, ...cells) {
  const cell_values = Array.prototype.slice.call(arguments, 1);
  return callAI_("value", [query, ...cell_values]);
}

/**
 * Have the AI create a list for you optionally limited to count
 *
 * @param {"pizza toppings"} query The query to pass to the AI.
 * @param {number} count The number of items to generate. Optional
 *
 * @customfunction
 */
function AI_List(query, count) {
  return callAI_("list", [query, count]);
}

/**
 * Have the AI create a table for you.
 *
 * @param {"Countries in the EU"} query The query to pass to the AI.
 * @param { A1:A3 } headers The headers for the table. If not passed the AI will generate them.
 * @param {27} count The number of rows to generate. Optional
 *
 * @customfunction
 */
function AI_Table(query, headers, count) {
  return callAI_("table", [query, headers, count]);
}
