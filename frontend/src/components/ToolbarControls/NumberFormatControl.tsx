import React, { ElementType, FunctionComponent, useCallback } from "react";
import escapeRegExp from "lodash/escapeRegExp";
import {
  CellAttributes,
  changeNumberOfDecimals,
  toCustomNumberFormat,
} from "../../SheetUtils";
import { CellAttribute, NumberFormat } from "../../NeptyneProtocol";
import { ReactComponent as PercentageIcon } from "../../icons/percentage.svg";
import { ReactComponent as CurrencyIcon } from "../../icons/сurrency.svg";
import { ReactComponent as IntegerIcon } from "../../icons/integer.svg";
import { ReactComponent as DecimalIcon } from "../../icons/decimal.svg";
import { ReactComponent as CalendarIcon } from "../../icons/calendar.svg";
import { ReactComponent as ClockIcon } from "../../icons/clock.svg";
import { ReactComponent as DecimalIncrease } from "../../icons/decimalIncrease.svg";
import { ReactComponent as DecimalDecrease } from "../../icons/decimalDecrease.svg";
import { ButtonWithPopover, PopoverContainer } from "../ButtonWithPopover";
import { hotKeys } from "../../hotkeyConstants";
import { ToolbarIconButton } from "./ToolbarIconButton";
import { SecondaryDivider } from "./TextAlignControl";
import {
  DATE_FORMATS,
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIME_FORMAT,
  TIME_FORMATS,
} from "../../datetimeConstants";
import { joinArrayBy, splitIntoGroups } from "../../commonUtils";
import { formatAndSubformatFromCellAttribute } from "../../RenderTools";

export interface NumberFormatControlProps {
  isDisabled: boolean;
  cellAttributes: CellAttributes;
  onSelectionAttributeChange: (
    attributeName: CellAttribute,
    value: string | undefined
  ) => void;
  cellValue: string | number | null;
}

interface ButtonModel {
  tooltip: string;
  hotKey?: string;
  value: string;
  values?: string[];
  Icon: ElementType;
  isActive: (numberFormat: string | undefined) => boolean;
}

const ICON_SIZE = 18;

const COLS = 4;

function isCommonButtonActive(
  this: ButtonModel,
  numberFormat: string | undefined
): boolean {
  return numberFormat === this.value;
}

function isDateTimeButtonActive(
  this: ButtonModel,
  numberFormat: string | undefined
): boolean {
  return Boolean(
    numberFormat?.startsWith(NumberFormat.Date) &&
      (!this.values ||
        new RegExp(`\\[(${this.values.map(escapeRegExp).join("|")})]$`).test(
          numberFormat
        ))
  );
}

function isNeverActive(): boolean {
  return false;
}

const buttonsModel: ButtonModel[] = [
  {
    tooltip: "Percentage",
    value: NumberFormat.Percentage,
    Icon: PercentageIcon,
    hotKey: hotKeys.formatAsPercentage,
    isActive: isCommonButtonActive,
  },
  {
    tooltip: "Currency",
    value: NumberFormat.Money,
    Icon: CurrencyIcon,
    hotKey: hotKeys.formatAsCurrency,
    isActive: isCommonButtonActive,
  },
  {
    tooltip: "Integer",
    value: NumberFormat.Integer,
    Icon: IntegerIcon,
    isActive: isCommonButtonActive,
  },
  {
    tooltip: "Decimal",
    value: NumberFormat.Float,
    Icon: DecimalIcon,
    hotKey: hotKeys.formatAsFloat,
    isActive: isCommonButtonActive,
  },
  {
    tooltip: "Date",
    value: `${NumberFormat.Date}-${DEFAULT_DATE_FORMAT}`,
    values: DATE_FORMATS,
    Icon: CalendarIcon,
    hotKey: hotKeys.formatAsDate,
    isActive: isDateTimeButtonActive,
  },
  {
    tooltip: "Time",
    value: `${NumberFormat.Date}-${DEFAULT_TIME_FORMAT}`,
    values: TIME_FORMATS,
    Icon: ClockIcon,
    hotKey: hotKeys.formatAsTime,
    isActive: isDateTimeButtonActive,
  },
  {
    tooltip: "Decrease decimal places",
    value: "-0",
    Icon: DecimalDecrease,
    isActive: isNeverActive,
  },
  {
    tooltip: "Increase decimal places",
    value: "+0",
    Icon: DecimalIncrease,
    isActive: isNeverActive,
  },
];

export const NumberFormatControl: FunctionComponent<NumberFormatControlProps> = ({
  cellAttributes,
  onSelectionAttributeChange,
  isDisabled,
  cellValue,
}) => {
  const buttonHandlers = buttonsModel.map((button) =>
    // Incorrectly thinks that hook is defined inside another hook,
    // while we're just iterating through two constants, which is fine.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useCallback(() => {
      if (!button.isActive(cellAttributes[CellAttribute.NumberFormat]))
        if (button.value === "+0" || button.value === "-0") {
          const [numberFormat, subformat] = formatAndSubformatFromCellAttribute(
            CellAttribute.NumberFormat,
            cellAttributes
          );
          const customFormat = toCustomNumberFormat(numberFormat, subformat);
          onSelectionAttributeChange(
            CellAttribute.NumberFormat,
            NumberFormat.Custom +
              "-" +
              changeNumberOfDecimals(customFormat, cellValue, button.value === "+0")
          );
        } else {
          onSelectionAttributeChange(CellAttribute.NumberFormat, button.value);
        }
      // Cause of issue above thinks that button is a prop, while it isn't.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cellAttributes[CellAttribute.NumberFormat], onSelectionAttributeChange])
  );

  const renderedButtons = buttonsModel.map((button, index) => (
    <ToolbarIconButton
      key={button.value}
      testId={`number-format-${button.value}`}
      tooltip={button.tooltip}
      hotKey={button.hotKey}
      icon={button.Icon}
      onClick={buttonHandlers[index]}
      isActive={button.isActive(cellAttributes[CellAttribute.NumberFormat])}
      size={ICON_SIZE}
    />
  ));

  return (
    <ButtonWithPopover
      isDisabled={isDisabled}
      popoverId="NumberFormatPopover"
      testId="NumberFormatButton"
      icon={PercentageIcon}
      hasArrow
      popoverContent={joinArrayBy(
        splitIntoGroups(renderedButtons, COLS).map((group, idx) => (
          <PopoverContainer key={`group-${idx}`}>{group}</PopoverContainer>
        )),
        // Would not throw as now we only have one divider
        <SecondaryDivider key="divider" orientation="horizontal" />
      )}
    >
      Format
    </ButtonWithPopover>
  );
};
