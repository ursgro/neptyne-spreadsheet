import { authResult } from "@fyelci/react-google-drive-picker/dist/typeDefs";

export interface GoogleDriveDoc {
  url: string;
  authPayload: authResult;
}
