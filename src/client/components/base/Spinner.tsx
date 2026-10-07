import { Icon } from "./Icon";

export type SpinnerProps = {
  size?: number;
  className?: string;
};

export function Spinner({ size = 24, className = "" }: SpinnerProps) {
  return (
    <div className={`spinner-container ${className}`.trim()}>
      <Icon name="Loader2" size={size} className="spinner-icon animate-spin" />
    </div>
  );
}
