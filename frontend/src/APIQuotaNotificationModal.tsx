import Modal from "./components/Modal/Modal";

interface Props {
  open: boolean;
  service: string;
  onClose: () => void;
}

const APIQuotaNotificationModal = ({ open, onClose }: Props) => {
  return (
    <Modal open={open} onClose={onClose}>
      <div>
        <p>You've used 100% of the free API quota Neptyne provides you for APIs.</p>
        <p>
          In order to continue, you can either supply the APIs you are using with your
          own keys (a paid plan with that provider might be required) or upgrade your{" "}
          <a href="/--/subscription">Neptyne account</a>
        </p>
      </div>
    </Modal>
  );
};

export default APIQuotaNotificationModal;
