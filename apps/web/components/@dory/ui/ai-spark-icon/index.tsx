import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import * as React from "react";

export function AISparkIcon({
  size = 24,
  className,
  loading = false,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  size?: number;
  loading?: boolean;
}) {
  return (
    <Sparkles className="h-4 w-4 text-[#9460FF]" />
    // <svg
    //   {...props}
    //   width={size}
    //   height={size}
    //   viewBox="0 0 24 24"
    //   className={cn(
    //     "inline-flex items-center justify-center transition-all duration-300 flex-shrink-0",
    //     "hover:scale-110 hover:rotate-6",
    //     "hover:drop-shadow-[0_0_6px_rgba(125,92,255,0.6)]",
    //     "dark:hover:drop-shadow-[0_0_8px_rgba(176,108,255,0.8)]",
    //     loading && "animate-ai-pulse-strong",
    //     className
    //   )}
    //   style={{ transformOrigin: "center center" }} // 动画更自然
    // >
    //   <defs>
    //     <linearGradient id="ai_star_grad" x1="0" x2="1" y1="0" y2="1">
    //       <stop offset="0%" stopColor="#6A5BFF" />
    //       <stop offset="100%" stopColor="#B06CFF" />
    //     </linearGradient>
    //   </defs>

    //   <g fill="url(#ai_star_grad)" opacity="0.9">
    //     <path d="M12 2L13.8 8.2L20 10L13.8 11.8L12 18L10.2 11.8L4 10L10.2 8.2L12 2Z" />
    //   </g>

    //   <style jsx>{`
    //     @keyframes aiPulseStrong {
    //       0% {
    //         transform: scale(1);
    //         opacity: 0.75;
    //       }
    //       50% {
    //         transform: scale(1.22);
    //         opacity: 1;
    //       }
    //       100% {
    //         transform: scale(1);
    //         opacity: 0.75;
    //       }
    //     }

    //     .animate-ai-pulse-strong {
    //       animation: aiPulseStrong 1.2s ease-in-out infinite;
    //     }
    //   `}</style>
    // </svg>
  );
}

