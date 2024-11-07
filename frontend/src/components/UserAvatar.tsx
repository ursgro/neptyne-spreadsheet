import { Avatar, Box, Tooltip } from "@mui/material";
import { forwardRef, memo, useMemo } from "react";
import BoltIcon from "@mui/icons-material/Bolt";

import { useCapabilities } from "../capabilities";

/**
 * Converts John Doe to JD.
 */
export const getInitials = (fullName: string): string => {
  const initials = fullName
    .split(" ")
    .map((name) => name.substring(0, 1).toUpperCase())
    .join("");

  // handle names with more than two words. Return first and last initial
  if (initials.length > 2) {
    return `${initials[0]}${initials[initials.length - 1]}`;
  }
  return initials;
};

/**
 * Converts provided string into colour.
 *
 * Source: https://medium.com/@pppped/compute-an-arbitrary-color-for-user-avatar-starting-from-his-username-with-javascript-cd0675943b66
 */
export const getColor = (
  from: string,
  saturation: number = 80,
  lightness: number = 80
): string => {
  let hash = 0;
  for (var i = 0; i < from.length; i++) {
    hash = from.charCodeAt(i) + ((hash << 5) - hash);
  }

  const hue = hash % 360;
  return "hsl(" + hue + ", " + saturation + "%, " + lightness + "%)";
};

export interface UserAvatarProps {
  email?: string;
  size?: number;
  name: string;
  photoURL?: string;
  // TODO: make required as soon as we settle down with current user colour
  color?: string;
  primary?: boolean;
}

export const getUserAvatarSizeSX = (size: number) => ({
  width: size,
  height: size,
  fontSize: size / 2,
});

export const UserAvatar = memo(
  forwardRef<HTMLDivElement, UserAvatarProps>(
    ({ photoURL, size = 40, primary, name, ...rest }, ref) => {
      const { hasPremium } = useCapabilities();
      const sx = useMemo(
        () => ({
          ...getUserAvatarSizeSX(size),
          bgcolor: rest.color || (rest.email && getColor(rest.email)),
        }),
        [rest.color, rest.email, size]
      );

      return (
        <Box position="relative">
          <Avatar ref={ref} {...rest} src={photoURL} alt={name} sx={sx}>
            {name ? getInitials(name) : "An"}
          </Avatar>
          {hasPremium && primary && (
            <Box position="absolute" bottom={-8} right={-5}>
              <Tooltip title="Subscribed to Neptyne Pro">
                <BoltIcon
                  className="premium-avatar-badge"
                  color="secondary"
                  fontSize="medium"
                />
              </Tooltip>
            </Box>
          )}
        </Box>
      );
    }
  )
);
