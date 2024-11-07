interface LintProblem {
  sheet: string;
  address: string;
  problem: string;
  fix: string;
  example: string;
  severity: "high" | "medium" | "low";
}

export interface LintResult {
  summary: string;
  description: string;
  fileName: string;
  subtables: Record<string, string[]>;
  calculations: string[];
  problems: LintProblem[];
  prompt: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  jsonResponse: string;
}

export interface LintResultsProps extends LintResult {
  debug: boolean;
}

const LintResults = ({
  debug,
  fileName,
  subtables,
  summary,
  calculations,
  problems,
  jsonResponse,
  prompt,
  promptTokens,
  completionTokens,
  totalTokens,
}: LintResultsProps) => {
  return (
    <div>
      <h1>{fileName}</h1>
      <section className="container">
        <b>Description</b>
        <p>{summary}</p>
      </section>
      <section className="container">
        <b>Calculations</b>
        <ul>
          {calculations.map((calculation, i) => (
            <li key={i}>{calculation}</li>
          ))}
        </ul>
      </section>
      {debug && (
        <section className="container">
          <b>Ranges</b>
          {Object.entries(subtables).map(([name, range], i) => (
            <p key={i}>
              <b>{name}</b>: {range.join(", ")}
            </p>
          ))}
        </section>
      )}
      <section className="container">
        <b>Problems</b>
        <ul>
          {problems.map((problem, i) => (
            <li key={i} className={`problem-severity-${problem.severity}`}>
              <b>Location:</b>
              {problem.sheet} {problem.address}
              <br />
              <b>Problem:</b> {problem.problem} ({problem.severity})<br />
              <b>Example:</b> {problem.example}
              <br />
              <b>Fix:</b> {problem.fix}
              <br />
            </li>
          ))}
        </ul>
      </section>

      {debug && jsonResponse && (
        <section className="container">
          <b>JSON Response</b>
          <pre>{jsonResponse}</pre>
          <br />
          <b>Tokens:</b>
          <br />
          Prompt: {promptTokens}
          <br />
          Completion: {completionTokens}
          <br />
          Total: {totalTokens}
          <br />
        </section>
      )}

      {debug && prompt && (
        <section className="container" style={{ fontFamily: "monospace" }}>
          <pre>{prompt}</pre>
        </section>
      )}
    </div>
  );
};

export default LintResults;
