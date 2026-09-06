import React from "react";

export interface ThreadIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
  threadColor?: string;
  spoolColor?: string;
}

export function ThreadIcon({
  size = 20,
  className = "",
  threadColor = "var(--accent-base)",
  spoolColor = "currentColor",
  style,
  ...props
}: ThreadIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`inline-block align-middle shrink-0 ${className}`.trim()}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...props}
    >
      {/* Top Spool Flange */}
      <path
        d="M5 3.5C5 2.67 5.67 2 6.5 2H17.5C18.33 2 19 2.67 19 3.5C19 4.33 18.33 5 17.5 5H6.5C5.67 5 5 4.33 5 3.5Z"
        fill={spoolColor}
        fillOpacity="0.45"
      />
      {/* Top Hole In Spool */}
      <ellipse
        cx="12"
        cy="3.5"
        rx="2"
        ry="0.75"
        fill="currentColor"
        fillOpacity="0.85"
      />

      {/* Spool Inner Core / Axle backing */}
      <rect
        x="8.5"
        y="5"
        width="7"
        height="14"
        fill={spoolColor}
        fillOpacity="0.3"
      />

      {/* Wound Thread Body */}
      <rect
        x="6"
        y="5"
        width="12"
        height="14"
        rx="1.5"
        fill={threadColor}
      />

      {/* Thread Texture / Ridge Highlights & Shadows */}
      <path
        d="M6 7.5H18 M6 10.5H18 M6 13.5H18 M6 16.5H18"
        stroke="#ffffff"
        strokeWidth="0.75"
        strokeOpacity="0.25"
        strokeLinecap="round"
      />
      <path
        d="M6 8.5H18 M6 11.5H18 M6 14.5H18 M6 17.5H18"
        stroke="#000000"
        strokeWidth="0.75"
        strokeOpacity="0.25"
        strokeLinecap="round"
      />

      {/* Bottom Spool Flange */}
      <path
        d="M5 19.5C5 18.67 5.67 18 6.5 18H17.5C18.33 18 19 18.67 19 19.5C19 20.33 18.33 21 17.5 21H6.5C5.67 21 5 20.33 5 19.5Z"
        fill={spoolColor}
        fillOpacity="0.45"
      />

      {/* Loose Thread Tail dangling from the spool */}
      <path
        d="M17.5 17.5C19.8 18.2 21.2 19.8 20.2 22C19.6 23.2 17.8 22.8 17.2 21.8"
        stroke={threadColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export default ThreadIcon;
