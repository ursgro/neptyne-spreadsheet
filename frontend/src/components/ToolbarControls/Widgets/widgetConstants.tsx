import { ReactComponent as WidgetButtonIcon } from "../../../icons/widgetButton.svg";
import { ReactComponent as WidgetDropdownIcon } from "../../../icons/widgetDropdown.svg";
import { ReactComponent as WidgetSliderIcon } from "../../../icons/widgetSlider.svg";
import { ReactComponent as WidgetAutofillIcon } from "../../../icons/widgetAutofill.svg";
import { ReactComponent as WidgetScatterIcon } from "../../../icons/widgetScatter.svg";
import { ReactComponent as WidgetTreeMapIcon } from "../../../icons/widgetTreeMap.svg";
import { ReactComponent as WidgetMapIcon } from "../../../icons/widgetMap.svg";
import { ReactComponent as WidgetLineIcon } from "../../../icons/widgetLine.svg";
import { ReactComponent as WidgetDateTimePicker } from "../../../icons/widgetDateTimePicker.svg";
import { ReactComponent as WidgetCheckbox } from "../../../icons/widgetCheckbox.svg";
import { ReactComponent as WidgetColumn } from "../../../icons/widgetColumn.svg";
import { ReactComponent as WidgetBar } from "../../../icons/widgetBar.svg";
import { ReactComponent as WidgetMarkdown } from "../../../icons/widgetMarkdown.svg";
import { ReactComponent as WidgetImage } from "../../../icons/widgetImage.svg";
import { ReactComponent as WidgetPie } from "../../../icons/widgetPie.svg";
import { WidgetRegistry } from "../../../NeptyneProtocol";

export const WIDGET_ICONS = {
  Button: <WidgetButtonIcon />,
  Dropdown: <WidgetDropdownIcon />,
  Slider: <WidgetSliderIcon />,
  Autocomplete: <WidgetAutofillIcon />,
  Scatter: <WidgetScatterIcon />,
  TreeMap: <WidgetTreeMapIcon />,
  Map: <WidgetMapIcon />,
  Line: <WidgetLineIcon />,
  DateTimePicker: <WidgetDateTimePicker />,
  Checkbox: <WidgetCheckbox />,
  Column: <WidgetColumn />,
  Bar: <WidgetBar />,
  Markdown: <WidgetMarkdown />,
  Image: <WidgetImage />,
  Pie: <WidgetPie />,
};

export const EMPTY_WIDGET_REGISTRY: WidgetRegistry = {
  widgets: {},
};
