export enum KernelProtocol {
  // When backwards-incompatible changes are made to the kernel/server/client
  // protocol, update this version tag (do not add a new one). This will mean
  // kernel_protocol_version.py will also need to be updated which is expected.
  // Old (incompatible) kernels will be ignored by the server.
  // The string can be any value. So how about
  // https://en.wikipedia.org/wiki/Moons_of_Neptune ?
  Version = "triton",
}

export enum CellAttribute {
  ExecutionPolicy = "executionPolicy",
  Class = "class",
  TextStyle = "textStyle",
  TextAlign = "textAlign",
  VerticalAlign = "verticalAlign",
  Link = "link",
  Note = "note",
  Color = "color",
  BgColor = "backgroundColor",
  NumberFormat = "numberFormat",
  Widget = "widget",
  RenderWidth = "renderWidth",
  RenderHeight = "renderHeight",
  Border = "border",
  IsProtected = "isProtected",
  WidgetName = "widgetName",
  FontSize = "fontSize",
  Font = "font",
  RowSpan = "rowSpan",
  ColSpan = "colSpan",
  LineWrap = "lineWrap",
  Source = "source",
}

export enum TyneCategories {
  AuthoredByMe = "authoredByMe",
  SharedWithMe = "sharedWithMe",
  EditableByMe = "editableByMe",
  InGallery = "inGallery",
}

export enum AccessScope {
  Restricted = "restricted",
  Team = "team",
  Anyone = "anyone",
}

export enum AccessLevel {
  Owner = "OWNER",
  View = "VIEW",
  // Comment = "COMMENT",
  Edit = "EDIT",
}

export interface TyneListItem {
  fileName: string;
  name: string;
  description?: string;
  owner: string;
  ownerProfileImage?: string;
  ownerColor: string;
  access: string;
  lastModified: Date;
  categories: TyneCategories[];
  galleryScreenshotUrl?: string;
  galleryCategory?: string;
  lastOpened?: Date;
}

export interface ShareRecord {
  name: string | null;
  email: string;
  access_level: AccessLevel;
}

export interface TyneShareResponse {
  shares: ShareRecord[];
  users: {
    email: string;
    name: string | null;
  }[];
  generalAccessLevel?: AccessLevel;
  generalAccessScope?: AccessScope;
  teamName?: string;
  shareMessage?: string;
  isApp: boolean;
  description: string;
}

export const CLEARABLE_ATTRIBUTES: CellAttribute[] = [
  CellAttribute.Class,
  CellAttribute.TextStyle,
  CellAttribute.TextAlign,
  CellAttribute.VerticalAlign,
  CellAttribute.Color,
  CellAttribute.BgColor,
  CellAttribute.NumberFormat,
  CellAttribute.Widget,
  CellAttribute.Border,
  CellAttribute.Font,
  CellAttribute.FontSize,
];

export const COPYABLE_ATTRIBUTES: CellAttribute[] = [
  CellAttribute.Class,
  CellAttribute.TextStyle,
  CellAttribute.TextAlign,
  CellAttribute.VerticalAlign,
  CellAttribute.Link,
  CellAttribute.Note,
  CellAttribute.Color,
  CellAttribute.BgColor,
  CellAttribute.NumberFormat,
  CellAttribute.Widget,
  CellAttribute.RenderWidth,
  CellAttribute.RenderHeight,
  CellAttribute.Border,
  CellAttribute.WidgetName,
];

export enum LineWrap {
  Truncate = "truncate",
  Wrap = "wrap",
  Overflow = "overflow",
}

export enum TextStyle {
  Bold = "bold",
  Italic = "italic",
  Underline = "underline",
}

export enum TextAlign {
  Left = "left",
  Center = "center",
  Right = "right",
}

export const LineWrapDefault = LineWrap.Truncate;

export const TextAlignDefault = TextAlign.Left;

export const TextAlignNumber = TextAlign.Right;

export const TextColorDefault = "#000000";
export const BgColorDefault = "#ffffff";

export enum VerticalAlign {
  Top = "top",
  Middle = "middle",
  Bottom = "bottom",
}

export const VerticalAlignDefault = VerticalAlign.Top;

export enum BorderType {
  BorderTop = "border-top",
  BorderBottom = "border-bottom",
  BorderLeft = "border-left",
  BorderRight = "border-right",
}

export enum NumberFormat {
  Money = "money",
  Percentage = "percentage",
  Integer = "integer",
  Float = "float",
  Date = "date",
  Custom = "custom",
}

export enum MessageTypes {
  AckRunCells = "ack_run_cells",
  ApiQuotaExceeded = "api_quota_exceeded",
  AuthReply = "auth_reply",
  AuthRequired = "auth_required",
  ChangeCellAttribute = "change_cell_attribute",
  ChangeSheetAttribute = "change_sheet_attribute",
  ChangeSheetAttributeReply = "change_sheet_attribute_reply",
  Confetti = "confetti",
  CreateSheet = "create_sheet",
  DeleteSheet = "delete_sheet",
  DragRowColumn = "drag_row_column",
  GetSecrets = "get_secrets",
  InsertDeleteCells = "insert_delete_cells",
  InsertDeleteCellsReply = "insert_delete_cells_reply",
  InstallRequirements = "install_requirements",
  InterruptKernel = "interrupt_kernel",
  Linter = "linter",
  LogEvent = "log_event",
  NavigateTo = "navigate_to",
  NotifyOwner = "notify_owner", // deprecated
  Ping = "ping",
  ReconnectKernel = "reconnect_kernel",
  ReloadEnv = "reload_env",
  RenameSheet = "rename_sheet",
  RenameTyne = "rename_tyne",
  RpcRequest = "rpc_request",
  RpcResult = "rpc_result",
  RunCells = "run_cells",
  RerunCells = "rerun_cells",
  SaveCell = "save_cell",
  SaveKernelState = "save_kernel_state",
  SaveTyne = "save_tyne",
  SendEmail = "send_email",
  SendUndoMessage = "send_undo_message",
  SetSecret = "set_secret",
  SetSecrets = "set_secrets",
  SheetAutofill = "sheet_autofill",
  CopyCells = "copy_cells",
  SheetUpdate = "sheet_update",
  ShowAlert = "show_alert",
  StartDownload = "start_download",
  SubscribersUpdated = "subscribers_updated",
  Traceback = "traceback",
  TickReply = "tick_reply",
  TynePropertyUpdate = "tyne_property_update",
  TyneSaved = "tyne_saved",
  TyneSaving = "tyne_saving",
  UploadFileToGCP = "upload_file_to_gcp",
  UploadFile = "upload_file",
  UserAPIResponseStream = "user_api_response_stream",
  WidgetGetState = "widget_get_state",
  WidgetValidateParams = "widget_validate_params",
  WidgetValueUpdate = "widget_value_update",
}

export enum KernelInitState {
  RunningCodePanel = "run_code_panel",
  InstallingRequirements = "installing_requirements",
  LoadingSheetValues = "loading_sheet_values",
}

export enum MimeTypes {
  NeptyneWidget = "application/vnd.neptyne-widget.v1+json",
  NeptyneOutputWidget = "application/vnd.neptyne-output-widget.v1+json",
  NeptyneError = "application/vnd.neptyne-error.v1+json",
  Popo = "application/vnd.popo.v1+json",
}

export enum Dimension {
  Row = "row",
  Col = "col",
}

export enum SheetTransform {
  InsertBefore = "insert_before",
  Delete = "delete",
}

export enum WidgetParamType {
  String = "string",
  Int = "int",
  Float = "float",
  Enum = "enum",
  Boolean = "boolean",
  Function = "function",
  List = "list",
  Dict = "dict",
  Color = "color",
  Other = "other",
}

export type SheetUnawareCellId = [number, number];
export type SheetCellId = [number, number, number];
export type NotebookCellId = string;

export type CellId = SheetCellId | NotebookCellId;

export enum SheetAttribute {
  ColsSizes = "colsSizes",
  RowsSizes = "rowsSizes",
  ResearchMetaData = "researchMetaData",
}
export interface SheetAttributeUpdate {
  attribute: string;
  value: any;
  sheetId: number;
}

export interface CellAttributeUpdate {
  cellId: SheetCellId;
  attribute: string;
  value: string | undefined | number;
}

export interface CellAttributesUpdate {
  updates: CellAttributeUpdate[];
}

export interface CallServerContent {
  method: string;
  args: string[];
  kwargs: { [param: string]: any };
}

export interface CellChange {
  cellId?: CellId;
  content: string;
  // if set, attributes sets all attributes of the cell and is not just an update:
  attributes?: { [attrName: string]: any };
  mimeType?: string;
}

export interface RunCellsContent {
  toRun: CellChange[];
  notebook: boolean;
  forAI: boolean;
  gsMode: boolean;
  aiTables?: { [attrName: string]: any }[];
  currentSheet: number;
  currentSheetName?: string;
  sheetIdsByName?: { [name: string]: number };
}

export interface RerunCellsContent {
  changedFunctions: string[];
  addresses: SheetCellId[];
}

export interface SheetUpdateContent {
  cellUpdates: any[];
}

export interface TynePropertyUpdateContentChange {
  property: string;
  value: any;
}

export interface TynePropertyUpdateContent {
  changes: TynePropertyUpdateContentChange[];
}

export interface CopyCellsContent {
  anchor: string;
  toCopy: CellChange[];
}

export interface SheetAutofillContent {
  populateFrom: { cellId: SheetCellId; content: string }[];
  populateToStart: SheetCellId;
  populateToEnd: SheetCellId;
  autofillContext?: string[];
  table?: { [attrName: string]: any };
  toFill?: string[][];
}

export interface SelectionRect {
  min_row: number;
  max_row: number;
  min_col: number;
  max_col: number;
}

export interface InsertDeleteContent {
  sheetTransform: SheetTransform;
  dimension: Dimension;
  selectedIndex: number;

  // Defaults to 1 if unset.
  amount?: number;
  boundary?: SelectionRect;

  // Only set for "undo" messages
  cellsToPopulate?: { [prop: string]: any }[];
  sheetId?: number;
}

export interface DragRowColumnContent {
  fromIndex: number;
  toIndex: number;
  amount: number;
  sheetId: number;
  dimension: Dimension;
}

export interface WidgetValueContent {
  cellId: string;
  value: any;
}

export interface WidgetParamDefinition {
  name: string;
  type: WidgetParamType;
  description: string;
  optional: boolean;
  inline: boolean;
  kwOnly: boolean;
  category?: string;
  defaultValue?: any;
  enumValues?: { [name: string]: any };
}

export interface WidgetDefinition {
  name: string;
  description: string;
  category: string;
  params: WidgetParamDefinition[];
}

export interface WidgetRegistry {
  widgets: { [name: string]: WidgetDefinition };
}

export interface InsertDeleteReply<CellType> {
  cell_updates: CellType[];
  n_cols: number;
  n_rows: number;
  sheet_attribute_updates: { [name: string]: any };
  sheet_id: number;
  sheet_name: string;
}

export interface DeleteSheetContent {
  sheetId: number;
}

export interface Subscriber {
  user_email: string;
  user_name: string;
  user_profile_image: string;
  user_color: string;
}

export interface SubscribersUpdatedContent {
  subscribers: Subscriber[];
}

export interface RenameSheetContent {
  sheetId: number;
  name: string;
}

export interface InstallRequirementsContent {
  requirements: string;
}

export interface DownloadRequest {
  payload: string;
  mimetype: string;
  filename: string;
}

export interface TracebackFrame {
  current_cell: boolean;
  lineno: number;
  line: string;
  exec_count?: number;
}

export interface NavigateToContent {
  sheet: number;
  row: number;
  col: number;
}

export interface WidgetGetStateContent {
  cellId: SheetCellId;
}

export interface WidgetValidateParamsContent {
  code: string;
  params: { [name: string]: string };
}

export interface TyneEvent {
  message: string;
  severity: "INFO" | "WARNING" | "ERROR";
  extra: { [key: string]: any };
  date: string;
}

export interface StripeSubscription {
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: number;
  portalUrl: string;
  ownerEmail: string;
}

export interface RenameTyneContent {
  name: string;
}

export interface SetSecretsContent {
  user: Secrets;
  tyne: Secrets;
}

export type Secrets = { [key: string]: string };

export interface TickReplyContent {
  addresses: [number, number, number][];
  expressions: string[];
}

export interface OrganizationCreateContent {
  name: string;
  domain?: string;
}

// This is how the user is using the tyne, distinct from their access level to the tyne.
export enum AccessMode {
  ReadOnlyDisconnected = "READ_ONLY_DISCONNECTED",
  ReadOnlyConnected = "READ_ONLY_CONNECTED",
  Edit = "EDIT",
  App = "APP",
}

export interface GSheetsImage {
  url: string;
  row: number;
  col: number;
  sheet: number;
  address: string;
  objectType: string;
  action?: string;
  actionNumber?: number;
}

export interface ResearchUsage {
  startTime: Date;
  runningTime: number;
  webSearches: number;
  AICalls: number;
  promptTokens: number;
  completionTokens: number;
  embeddingsCalls: number;
  phantomJsCalls: number;
}

export interface ResearchMessage {
  msg: string;
}

export interface ResearchError {
  error: string;
}

export interface ResearchCell {
  row: number;
  col: number;
}
export interface ResearchSource {
  title: string;
  url: string;
  cells: ResearchCell[];
}
export interface ResearchTable {
  table: (number | string | null)[][];
  sources: ResearchSource[];
  usage?: ResearchUsage;
}
export interface StreamlitAppConfig {
  width: number;
  height: number;
  windowCaption: string;
  sidebar: boolean;
  auto_open: boolean;
  public: boolean;
}

export interface SheetData {
  name: string;
  values: (string | number)[][];
}

export interface UserViewState {
  showGetStartedOnNewSheet?: boolean;
  latestReleaseNotesViewed?: string;
}
