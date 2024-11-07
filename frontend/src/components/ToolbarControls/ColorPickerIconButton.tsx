import { FunctionComponent, useMemo, useState } from "react";
import { ColorPickerPopover } from "../ColorPicker";
import { NeptyneIconButton, NeptyneIconButtonProps } from "../NeptyneIconButton";

interface ColorPickerIconButtonProps extends Omit<NeptyneIconButtonProps, "onClick"> {
  value: string;
  onSelect: (value: string) => void;
  onCopyFormatToggle: () => void;
}

export const ColorPickerIconButton: FunctionComponent<ColorPickerIconButtonProps> = ({
  tooltip,
  value,
  onSelect,
  onCopyFormatToggle,
  ...props
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
    onCopyFormatToggle();
    event.stopPropagation();
  };

  const handleClose = () => setAnchorEl(null);

  const open = !!anchorEl;
  const id = open ? "color-popover" : undefined;

  const SX = useMemo(
    () => ({
      ...(props.SX || {}),
      "& .NeptyneIconButton__Icon .color-sensitive": { stroke: value },
    }),
    [props.SX, value]
  );
  const activeSX = useMemo(
    () => ({
      ...(props.activeSX || {}),
      "& .NeptyneIconButton__Icon .color-sensitive": { stroke: value },
    }),
    [props.activeSX, value]
  );

  return (
    <>
      <NeptyneIconButton
        {...props}
        onClick={handleClick}
        SX={SX}
        activeSX={activeSX}
        isActive={open}
      />
      <ColorPickerPopover
        id={id}
        isOpen={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        value={value}
        onSelect={(value) => {
          handleClose();
          onSelect(value);
        }}
      />
    </>
  );
};
