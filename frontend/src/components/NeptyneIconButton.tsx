import React, {
  ElementType,
  FunctionComponent,
  MouseEvent,
  ReactNode,
  useMemo,
} from "react";
import IconButton from "@mui/material/IconButton";
import { alpha, Box, Icon, Tooltip } from "@mui/material";
import { SystemStyleObject, Theme as SystemTheme } from "@mui/system";
import { ReactComponent as ArrowDown } from "../icons/arrowDown.svg";
import { Theme } from "@mui/material/styles";

export interface NeptyneIconButtonProps {
  size?: number;
  testId?: string;
  isActive?: boolean;
  isDisabled?: boolean;
  hasArrow?: boolean;
  tooltip?: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  icon: ElementType;
  SX?: SystemStyleObject;
  activeSX?: SystemStyleObject;
  muiButtonProps?: React.ComponentProps<typeof IconButton>;
  children?: ReactNode;
}

const padding = {
  vertical: 0.125, // EM
  horizontal: 0.5, // EM
};
const border = 1; // PX

export const NEPTYNE_ICON_BUTTON_HEIGHT = 45; // Approximate height measure (calculation would be quite complex)

const TOOLTIP_STYLE_PROPS = {
  tooltip: {
    sx: (theme: SystemTheme) => ({
      backgroundColor: theme.palette.grey[800],
      color: theme.palette.common.white,
    }),
  },
};

const ICON_CONTAINER_SX: SystemStyleObject = {
  alignItems: "center",
  display: "flex",
  justifyContent: "center",
};

const getArrowSX = (theme: Theme): SystemStyleObject => ({
  color: theme.palette.secondary.main,
  display: "inline-block",
  height: "13px",
  verticalAlign: "middle",
  width: "14px",
  transitionDuration: theme.transitions.duration.standard + "ms",
  transitionTimingFunction: theme.transitions.easing.easeOut,
  transitionProperty: "transform",
});

const getActiveArrowSX = (theme: Theme): SystemStyleObject => ({
  ...getArrowSX(theme),
  transform: "rotate3d(1, 0, 0, 180deg)",
});

const getBaseTextSX = (theme: Theme): SystemStyleObject => ({
  ...theme.typography.caption,
  color: "grey.400",
  textTransform: "initial",
  transition: "inherit",
  transitionProperty: "color",
});

const getBaseActiveSX = (theme: Theme): SystemStyleObject => ({
  backgroundColor: alpha(theme.palette.secondary.main, 0.11),
  ".NeptyneIconButton__Text": {
    ...getBaseTextSX(theme),
    color: "text.primary",
  },
});

const getBaseButtonSX = (theme: Theme): SystemStyleObject => {
  const baseTextSX = getBaseTextSX(theme);
  const baseActiveSX = getBaseActiveSX(theme);
  return {
    border: `${border}px solid`,
    borderColor: "transparent",
    borderRadius: "5px",
    color: "text.primary",
    display: "inline-block",
    padding: `${padding.vertical}em ${padding.horizontal}em`,
    transitionDuration: theme.transitions.duration.standard + "ms",
    transitionProperty: "color, background-color, border-color, border-radius",
    transitionTimingFunction: theme.transitions.easing.easeOut,
    "&:hover": baseActiveSX,
    "&:active": {
      outline: "none",
    },
    ".MuiSvgIcon-root": {
      verticalAlign: "middle",
    },
    ".NeptyneIconButton__Text": {
      ...baseTextSX,
    },
    ".NeptyneIconButton__Icon": {
      fontSize: "inherit",
    },
    "&::after": {
      content: "''",
      position: "absolute",
      left: 0,
      right: 0,
      bottom: -2,
      zIndex: theme.zIndex.modal + 1,
      height: "2px",
      backgroundColor: "transparent",
    },
  };
};

const getActiveButtonSX = (theme: Theme): SystemStyleObject => ({
  ...getBaseButtonSX(theme),
  ...getBaseActiveSX(theme),
  borderColor: "secondary.lightBorder",
  color: "secondary.main",
});

export const VerticalArrowIcon: FunctionComponent<{ isActive?: boolean }> = ({
  isActive,
  ...rest
}) => (
  <Icon
    className="vertical-arrow-icon"
    component={ArrowDown}
    sx={isActive ? getActiveArrowSX : getArrowSX}
    {...rest}
  />
);

export const NeptyneIconButton: FunctionComponent<NeptyneIconButtonProps> = ({
  icon,
  tooltip,
  size = 24,
  isActive,
  isDisabled,
  hasArrow,
  onClick,
  children,
  muiButtonProps,
  SX,
  activeSX,
  testId,
}) => {
  const baseButtonSX = useMemo(
    () => [getBaseButtonSX, SX!, { fontSize: size + "px" }].filter(Boolean),
    [SX, size]
  );

  const activeButtonSX = useMemo(
    () => [getActiveButtonSX, activeSX!, { fontSize: size + "px" }].filter(Boolean),
    [activeSX, size]
  );

  const button = (
    <IconButton
      onClick={onClick}
      disabled={isDisabled}
      sx={isActive ? activeButtonSX : baseButtonSX}
      data-testid={testId}
      disableRipple
      {...muiButtonProps}
      {...(isActive ? { className: "is-selected" } : {})}
    >
      <Box sx={ICON_CONTAINER_SX}>
        <Icon className="NeptyneIconButton__Icon" component={icon} />
        {hasArrow && <VerticalArrowIcon isActive={isActive} />}
      </Box>
      {children && <div className="NeptyneIconButton__Text">{children}</div>}
    </IconButton>
  );

  if (tooltip) {
    return (
      <Tooltip
        componentsProps={TOOLTIP_STYLE_PROPS}
        title={tooltip}
        disableInteractive={true}
      >
        {button}
      </Tooltip>
    );
  }
  return button;
};
