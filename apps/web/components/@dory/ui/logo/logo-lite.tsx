import * as React from "react";

type DoryLogoProps = React.SVGProps<SVGSVGElement>;

export default function DoryLogoLite({ className, ...props }: DoryLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      fill="none"
      className={className}
      {...props}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M56 32h84c52 0 92 40 92 96s-40 96-92 96H56V32zm28 28v136h56c36 0 64-28 64-68s-28-68-64-68H84z"
        clipRule="evenodd"
      />
    </svg>
  );
}
