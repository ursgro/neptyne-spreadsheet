import { Box, Button, Container, Snackbar, Typography } from "@mui/material";
import MuiAlert, { AlertProps } from "@mui/material/Alert";
import { forwardRef, useCallback, useState } from "react";
import authenticatedFetch from "./authenticatedFetch";
import { User } from "./user-context";

const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert(props, ref) {
  return <MuiAlert elevation={6} ref={ref} variant="filled" {...props} />;
});

interface Props {
  user: User | null;
}

const EmailVerification = ({ user }: Props) => {
  const isVerified = user && user.emailVerified;
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendEmailVerification = useCallback(() => {
    if (user) {
      setError(null);
      setSent(false);
      authenticatedFetch(user, "/api/users/self/send_verification_email", {
        method: "POST",
        body: "{}",
      })
        .then((response) => {
          if (response.ok) {
            setSent(true);
          } else {
            setError(
              "Error sending verification email. Please try again later. If the problem persists, contact support@neptyne.com"
            );
          }
        })
        .catch((error) => {
          setError(error.message);
        });
    }
  }, [user]);

  const handleSentClose = (event: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === "clickaway") {
      return;
    }
    setSent(false);
  };

  if (isVerified) {
    return <div>Thanks! Your email address has been verified.</div>;
  }

  return (
    <Container maxWidth="sm" sx={{ marginTop: 12 }}>
      <Typography variant="body1">
        In order to accept email shares or join organizations, you must verify your
        email address. Please check your email for a verification link. Click below to
        send a new verification email.
      </Typography>
      <Box justifyContent="center" display="flex">
        <Button variant="contained" onClick={sendEmailVerification}>
          Send Verification Email
        </Button>
      </Box>
      <Snackbar
        open={sent}
        autoHideDuration={6000}
        onClose={handleSentClose}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert onClose={handleSentClose} severity="success" sx={{ width: "100%" }}>
          Verification email sent!
        </Alert>
      </Snackbar>
      <Snackbar open={!!error}>
        <Alert severity="error">{error}</Alert>
      </Snackbar>
    </Container>
  );
};

export default EmailVerification;
