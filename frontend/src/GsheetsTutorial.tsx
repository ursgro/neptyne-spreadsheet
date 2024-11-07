import React, { useEffect, useState } from "react";
import { Box, Button } from "@mui/material";

const SAMPLE_CODE =
  "def say_hello(to_whom = None):\n" +
  '    to_whom = to_whom or "world"\n' +
  '    return "hello " + to_whom\n';

const SAMPLE_CODE_NUMPY =
  "import numpy as np\n\n" +
  "def random_array(n, i):\n" +
  "    return np.random.choice(i, n)\n\n" +
  "# In B1, C1 put 5, 50\n" +
  '# In A1:\n# =Py("random_array", B1, C1)\n';

const DEVELOPER_GUIDE = "https://docs.neptyne.com/server/kernel/neptyne_api.html";

const TUTORIAL_FLEXBOX_CSS = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "flex-start",
  textAlign: "center",
  height: "100vh",
};

const EditorTutorial = () => {
  return (
    <Box sx={TUTORIAL_FLEXBOX_CSS}>
      <h1>Writing your first function</h1>
      <p>
        Open the code editor: <b>{"Extensions > Neptyne > Show Code Editor"}</b>
      </p>
      <p>
        Use the editor to write your first Python function, or paste this one.
        <br />
        Your functions are automatically evaluated - No need to save!
      </p>

      <Button
        variant={"outlined"}
        onClick={() => {
          navigator.clipboard.writeText(SAMPLE_CODE);
        }}
        sx={{ marginBottom: "15px" }}
      >
        Copy Function
      </Button>
      <img
        alt={""}
        width={"320px"}
        height={"163px"}
        src={
          "https://storage.googleapis.com/neptyne-screenshots/gsheets-tutorial/sample_code.png"
        }
      ></img>
    </Box>
  );
};

const ReplTutorial = () => {
  return (
    <Box sx={TUTORIAL_FLEXBOX_CSS}>
      <h1>Using the REPL to test code</h1>
      <p>At the bottom of the editor, you can instantly run any Python expression!</p>
      <p>Let's test our function out by running:</p>
      <p>
        <b>
          <code>say_hello("Universe")</code>
        </b>
      </p>
      <img
        alt={""}
        width={"400px"}
        height={"123px"}
        src={
          "https://storage.googleapis.com/neptyne-screenshots/gsheets-tutorial/sample_repl_small.png"
        }
      ></img>
      <p>
        Check out the{" "}
        <a href={DEVELOPER_GUIDE} target="_blank" rel={"noreferrer"}>
          developer guide
        </a>{" "}
        to see what functions Neptyne provides
      </p>
    </Box>
  );
};

const SheetTutorial = () => {
  return (
    <Box sx={TUTORIAL_FLEXBOX_CSS}>
      <h1>Calling Python functions from the sheet</h1>
      <p>
        Paste the following code into <b>B1</b> to call <b>say_hello</b> passing in{" "}
        <b>A1</b> as the first argument
      </p>
      <p>
        <b>
          <code>=Py("say_hello", A1)</code>
        </b>
      </p>
      <img
        alt={""}
        width={"340px"}
        height={"95px"}
        src={
          "https://storage.googleapis.com/neptyne-screenshots/gsheets-tutorial/sheet_code_1.png"
        }
      ></img>
      <p>
        Now change <b>A1</b> to <b>earth</b>. <b>B1</b> re-evaluates automatically!
      </p>
      <img
        alt={""}
        width={"340px"}
        height={"95px"}
        src={
          "https://storage.googleapis.com/neptyne-screenshots/gsheets-tutorial/sheet_code_2.png"
        }
      ></img>
    </Box>
  );
};

const PackageTutorial = () => {
  return (
    <Box sx={TUTORIAL_FLEXBOX_CSS}>
      <h1>Using Python packages</h1>
      <p>
        Neptyne comes bundled with dozens of popular Python packages, such as numpy.
      </p>
      <Button
        variant={"outlined"}
        onClick={() => {
          navigator.clipboard.writeText(SAMPLE_CODE_NUMPY);
        }}
        sx={{ marginBottom: "15px" }}
      >
        Copy Code
      </Button>
      <Box>
        <img
          alt={""}
          width={"280px"}
          height={"118px"}
          src={
            "https://storage.googleapis.com/neptyne-screenshots/gsheets-tutorial/numpy_editor.png"
          }
        ></img>
        <img
          alt={""}
          width={"260px"}
          height={"118px"}
          src={
            "https://storage.googleapis.com/neptyne-screenshots/gsheets-tutorial/numpy_sheet.png"
          }
        ></img>
      </Box>
      <p>
        Did you notice the array spilled down the A column?{" "}
        <a
          href={"https://www.neptyne.com/google-sheets/writing-your-own-functions"}
          target="_blank"
          rel={"noreferrer"}
        >
          Learn more here
        </a>
      </p>
      <p>
        Add any PyPi package via:{" "}
        <b>{"Extensions > Neptyne > Install Python Packages"}</b>
        <br />
        <p>
          Check out our{" "}
          <a
            href={"https://www.neptyne.com/google-sheets/writing-your-own-functions"}
            target="_blank"
            rel={"noreferrer"}
          >
            full guide
          </a>{" "}
          on leveraging packages in Neptyne
        </p>
      </p>
    </Box>
  );
};

const SecretsTutorial = () => {
  return (
    <Box sx={TUTORIAL_FLEXBOX_CSS}>
      <h1>Secrets and APIs</h1>
      <p>
        Open the secret manager at <b>{"Extensions > Neptyne > Manage Secrets"}</b>
      </p>
      <img
        alt={""}
        width={"500px"}
        height={"181px"}
        src={
          "https://storage.googleapis.com/neptyne-screenshots/gsheets-tutorial/secrets.png"
        }
      ></img>
      <p>Use these secrets to store API keys or database credentials</p>
      <p>
        <a
          href={"https://www.neptyne.com/google-sheets/calling-apis-and-using-secrets"}
          target="_blank"
          rel={"noreferrer"}
        >
          Check out our full guide on building an application with OpenAI's GPT-3
        </a>
      </p>
    </Box>
  );
};

const ContinuedLearning = () => {
  return (
    <Box sx={TUTORIAL_FLEXBOX_CSS}>
      <h1>More Resources</h1>
      <Box sx={{ flexDirection: "column", textAlign: "left" }}>
        <li>
          Full documentation is available in our{" "}
          <a href={DEVELOPER_GUIDE} target="_blank" rel={"noreferrer"}>
            Developer Guide
          </a>
        </li>
        <li>
          Join our{" "}
          <a
            href={"https://discord.com/invite/GPSSWYwZAF"}
            target="_blank"
            rel={"noreferrer"}
          >
            Discord
          </a>{" "}
          community for product updates and support
        </li>
        <li>
          Get inspiration from our{" "}
          <a
            href={"https://www.neptyne.com/google-sheets/gallery"}
            target="_blank"
            rel={"noreferrer"}
          >
            Gallery
          </a>
        </li>
        <li>
          Explore{" "}
          <a
            href={"https://www.neptyne.com/google-sheets"}
            target="_blank"
            rel={"noreferrer"}
          >
            Advanced Features
          </a>{" "}
          to read/write cell values from within your functions or the REPL
        </li>
        <li>
          Check out more tutorials on our{" "}
          <a
            href={"https://www.neptyne.com/google-sheets/how-tos"}
            target="_blank"
            rel={"noreferrer"}
          >
            Website
          </a>{" "}
          or on{" "}
          <a
            href={
              "https://youtube.com/playlist?list=PLcixb5Km0BWhr4EUP1fkAyIbSzLNFS1LC&si=2X-HHTCmTYQgggZe"
            }
            target="_blank"
            rel={"noreferrer"}
          >
            Youtube
          </a>
        </li>
      </Box>

      <br />
      <img
        alt={""}
        src={
          "https://storage.googleapis.com/neptyne-screenshots/gsheets-tutorial/map.png"
        }
        width={"260px"}
        height={"162px"}
      ></img>
      <p>
        <b>We're excited to see what you will create with Neptyne!</b>
      </p>
    </Box>
  );
};

const TUTORIAL_PAGES = [
  <EditorTutorial />,
  <ReplTutorial />,
  <SheetTutorial />,
  <PackageTutorial />,
  <SecretsTutorial />,
  <ContinuedLearning />,
];

const GSheetsTutorial = () => {
  const [step, setStep] = useState(1);

  useEffect(() => {
    const loadStepFromLocalStorage = () => {
      const step = window.localStorage.getItem("step");
      if (step) {
        setStep(parseInt(step));
      }
    };

    loadStepFromLocalStorage();
  }, []);

  const handleNext = () => {
    if (step < TUTORIAL_PAGES.length) {
      window.localStorage.setItem("step", (step + 1).toString());
      setStep(step + 1);
    }
  };

  const handlePrevious = () => {
    if (step > 1) {
      window.localStorage.setItem("step", (step - 1).toString());
      setStep(step - 1);
    }
  };

  const handleStepChange = (newStep: number) => {
    if (newStep >= 1 && newStep <= TUTORIAL_PAGES.length) {
      window.localStorage.setItem("step", newStep.toString());
      setStep(newStep);
    }
  };

  const stepButtons = Array.from(
    { length: TUTORIAL_PAGES.length },
    (_, index) => index + 1
  );

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
      }}
    >
      {TUTORIAL_PAGES[step - 1]}

      <Box
        sx={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "absolute",
          bottom: 0,
          p: 2,
        }}
      >
        <Button onClick={handlePrevious} disabled={step === 1}>
          Previous
        </Button>
        <Box sx={{ display: "flex", alignItems: "center" }}>
          {stepButtons.map((buttonStep) => (
            <Button
              key={buttonStep}
              variant={step === buttonStep ? "contained" : "outlined"}
              onClick={() => handleStepChange(buttonStep)}
            >
              {buttonStep}
            </Button>
          ))}
        </Box>
        <Button onClick={handleNext} disabled={step === TUTORIAL_PAGES.length}>
          Next
        </Button>
      </Box>
    </Box>
  );
};

export default GSheetsTutorial;
