"use client"
import React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

// The beam curves follow a strict arithmetic family (each path shifts the control
// points by +7 in x / -8 in y), so we generate them instead of hardcoding ~8KB
// of SVG path data. This is faithful to the original 21st.dev component.
function beamPath(i: number): string {
  const s = 7 * i,
    t = 8 * i
  return `M${-380 + s} ${-189 - t}C${-380 + s} ${-189 - t} ${-312 + s} ${216 - t} ${152 + s} ${343 - t}C${616 + s} ${470 - t} ${684 + s} ${875 - t} ${684 + s} ${875 - t}`
}

const paths = Array.from({ length: 50 }, (_, i) => beamPath(i))
const staticUnderlay = Array.from({ length: 84 }, (_, i) => beamPath(i)).join("")

export const BackgroundBeams = React.memo(({ className }: { className?: string }) => {
  return (
    <div
      className={cn(
        "absolute h-full w-full inset-0 flex items-center justify-center",
        className,
      )}
    >
      <svg
        className="z-0 h-full w-full pointer-events-none absolute"
        width="100%"
        height="100%"
        viewBox="0 0 696 316"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d={staticUnderlay} stroke="url(#paint0_radial_beams)" strokeOpacity="0.05" strokeWidth="0.5" />

        {paths.map((path, index) => (
          <motion.path
            key={`path-${index}`}
            d={path}
            stroke={`url(#linearGradient-${index})`}
            strokeOpacity="0.4"
            strokeWidth="0.5"
          />
        ))}
        <defs>
          {paths.map((_, index) => (
            <motion.linearGradient
              id={`linearGradient-${index}`}
              key={`gradient-${index}`}
              initial={{ x1: "0%", x2: "0%", y1: "0%", y2: "0%" }}
              animate={{
                x1: ["0%", "100%"],
                x2: ["0%", "95%"],
                y1: ["0%", "100%"],
                y2: ["0%", `${93 + ((index * 7) % 8)}%`],
              }}
              transition={{
                duration: (index % 10) + 10,
                ease: "easeInOut",
                repeat: Infinity,
                delay: (index % 10),
              }}
            >
              <stop stopColor="#a8cc3c" stopOpacity="0" />
              <stop stopColor="#a8cc3c" />
              <stop offset="32.5%" stopColor="#7ed957" />
              <stop offset="100%" stopColor="#00d4aa" stopOpacity="0" />
            </motion.linearGradient>
          ))}

          <radialGradient
            id="paint0_radial_beams"
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(352 34) rotate(90) scale(555 1560.62)"
          >
            <stop offset="0.0666667" stopColor="var(--color-muted-foreground)" />
            <stop offset="0.243243" stopColor="var(--color-muted-foreground)" />
            <stop offset="0.43594" stopColor="var(--color-foreground)" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  )
})

BackgroundBeams.displayName = "BackgroundBeams"
