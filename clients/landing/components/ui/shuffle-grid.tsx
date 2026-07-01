"use client"

import { motion } from "framer-motion"
import { useEffect, useRef, useState } from "react"

// Real Zeitra app screens (captured from the in-app previews).
const SCREENS = [
  "home", "meals", "log-meal", "meal-generator", "plan-result", "meal-result",
  "cycle-calendar", "coach-dashboard", "analytics", "challenges", "community",
  "devices", "paywall",
]

const squareData = Array.from({ length: 16 }, (_, i) => ({
  id: i + 1,
  src: `/images/screens/${SCREENS[i % SCREENS.length]}.png`,
}))

const shuffle = (array: (typeof squareData)[0][]) => {
  let currentIndex = array.length,
    randomIndex
  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex)
    currentIndex--
    ;[array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]]
  }
  return array
}

const generateSquares = () => {
  return shuffle([...squareData]).map((sq) => (
    <motion.div
      key={sq.id}
      layout
      transition={{ duration: 1.5, type: "spring" }}
      className="w-full h-full rounded-xl overflow-hidden bg-muted ring-1 ring-black/10 dark:ring-white/10"
      style={{
        backgroundImage: `url(${sq.src})`,
        backgroundSize: "cover",
        backgroundPosition: "top center",
      }}
    />
  ))
}

export const ShuffleGrid = () => {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [squares, setSquares] = useState(generateSquares())

  useEffect(() => {
    const shuffleSquares = () => {
      setSquares(generateSquares())
      timeoutRef.current = setTimeout(shuffleSquares, 3000)
    }
    shuffleSquares()
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return (
    <div className="grid grid-cols-4 grid-rows-4 h-[450px] gap-2">
      {squares.map((sq) => sq)}
    </div>
  )
}
