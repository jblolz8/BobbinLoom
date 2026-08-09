import React from "react";
import * as LucideIcons from "lucide-react";

export type IconName = keyof typeof LucideIcons;

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  name: string;
  size?: number | string;
  color?: string;
  strokeWidth?: number | string;
  className?: string;
}

export function Icon({
  name,
  size = 18,
  color,
  strokeWidth = 2,
  className = "",
  style,
  ...props
}: IconProps) {
  // Access the icon component by name from LucideIcons
  const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<LucideIcons.LucideProps>>)[name];

  if (!IconComponent) {
    console.warn(`[Icon] Icon "${name}" not found in lucide-react.`);
    return null;
  }

  return (
    <IconComponent
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      className={`inline-block align-middle shrink-0 ${className}`.trim()}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      aria-hidden="true"
      {...props}
    />
  );
}

export default Icon;
