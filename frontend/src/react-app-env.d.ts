/// <reference types="react-scripts" />

type DataType = string | number | null;
interface ClipBoardData {
  data: DataType;
  setData: (type: string, text: DataType) => void;
  getData: (type: string) => DataType;
}
interface Window {
  clipboardData?: ClipBoardData;
}
