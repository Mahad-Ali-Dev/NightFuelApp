"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, useTransform, useSpring, useMotionValue } from "framer-motion";

/**
 * ScrollMorphHero (21st.dev: prashantsom75/scroll-morph-hero) — saved verbatim
 * in behavior; images + copy are props so Zeitra screenshots/copy can be
 * injected. Cards scatter → line → circle, then morph into a bottom arc on
 * (virtual) scroll, with mouse parallax and flip-on-hover cards.
 *
 * NOTE: this component CAPTURES wheel/touch scroll inside its container
 * (e.preventDefault) — mount it as a full-viewport intro/section, not
 * mid-page, or users will feel scroll hijacking.
 */

export type AnimationPhase = "scatter" | "line" | "circle" | "bottom-strip";

interface FlipCardProps {
  src: string;
  index: number;
  target: { x: number; y: number; rotation: number; scale: number; opacity: number };
}

const IMG_WIDTH = 60;
const IMG_HEIGHT = 85;

function FlipCard({ src, index, target }: FlipCardProps) {
  return (
    <motion.div
      animate={{
        x: target.x,
        y: target.y,
        rotate: target.rotation,
        scale: target.scale,
        opacity: target.opacity,
      }}
      transition={{ type: "spring", stiffness: 40, damping: 15 }}
      style={{
        position: "absolute",
        width: IMG_WIDTH,
        height: IMG_HEIGHT,
        transformStyle: "preserve-3d",
        perspective: "1000px",
      }}
      className="cursor-pointer group"
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
        transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
        whileHover={{ rotateY: 180 }}
      >
        {/* Front Face */}
        <div
          className="absolute inset-0 h-full w-full overflow-hidden rounded-xl shadow-lg bg-[var(--color-panel-2)]"
          style={{ backfaceVisibility: "hidden" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`hero-${index}`} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-black/10 transition-colors group-hover:bg-transparent" />
        </div>

        {/* Back Face */}
        <div
          className="absolute inset-0 h-full w-full overflow-hidden rounded-xl shadow-lg bg-[var(--color-panel)] flex flex-col items-center justify-center p-4 border border-[var(--color-border)]"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <div className="text-center">
            <p className="text-[8px] font-bold text-[var(--color-lime)] uppercase tracking-widest mb-1">View</p>
            <p className="text-xs font-medium text-[var(--color-foreground)]">Details</p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

const MAX_SCROLL = 3000;
const lerp = (start: number, end: number, t: number) => start * (1 - t) + end * t;

export interface ScrollMorphHeroProps {
  /** Card images (up to 20 used). */
  images: string[];
  introTitle?: React.ReactNode;
  introSub?: React.ReactNode;
  arcTitle?: React.ReactNode;
  arcSub?: React.ReactNode;
  /** Interactive content (CTAs) shown with the arc state. */
  arcExtra?: React.ReactNode;
  className?: string;
}

export default function ScrollMorphHero({
  images,
  introTitle = "The future is built on AI.",
  introSub = "SCROLL TO EXPLORE",
  arcTitle = "Explore Our Vision",
  arcSub = "Scroll through our curated collection.",
  arcExtra,
  className,
}: ScrollMorphHeroProps) {
  const TOTAL_IMAGES = Math.min(images.length, 20);
  const [introPhase, setIntroPhase] = useState<AnimationPhase>("scatter");
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const handleResize = (entries: ResizeObserverEntry[]) => {
      for (const entry of entries) {
        setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    };
    const observer = new ResizeObserver(handleResize);
    observer.observe(containerRef.current);
    setContainerSize({
      width: containerRef.current.offsetWidth,
      height: containerRef.current.offsetHeight,
    });
    return () => observer.disconnect();
  }, []);

  const virtualScroll = useMotionValue(0);
  const scrollRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Release the page at the bounds: once the morph has fully played (or is
      // rewound to the start), let native scrolling continue instead of
      // trapping the user inside the hero forever.
      const atEnd = scrollRef.current >= MAX_SCROLL && e.deltaY > 0;
      const atStart = scrollRef.current <= 0 && e.deltaY < 0;
      if (atEnd || atStart) return;
      e.preventDefault();
      const newScroll = Math.min(Math.max(scrollRef.current + e.deltaY, 0), MAX_SCROLL);
      scrollRef.current = newScroll;
      virtualScroll.set(newScroll);
    };

    let touchStartY = 0;
    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };
    const handleTouchMove = (e: TouchEvent) => {
      const touchY = e.touches[0].clientY;
      const deltaY = touchStartY - touchY;
      const atEnd = scrollRef.current >= MAX_SCROLL && deltaY > 0;
      const atStart = scrollRef.current <= 0 && deltaY < 0;
      if (atEnd || atStart) return; // release to native page scroll
      touchStartY = touchY;
      e.preventDefault();
      const newScroll = Math.min(Math.max(scrollRef.current + deltaY, 0), MAX_SCROLL);
      scrollRef.current = newScroll;
      virtualScroll.set(newScroll);
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("touchstart", handleTouchStart, { passive: false });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
    };
  }, [virtualScroll]);

  const morphProgress = useTransform(virtualScroll, [0, 600], [0, 1]);
  const smoothMorph = useSpring(morphProgress, { stiffness: 40, damping: 20 });
  const scrollRotate = useTransform(virtualScroll, [600, 3000], [0, 360]);
  const smoothScrollRotate = useSpring(scrollRotate, { stiffness: 40, damping: 20 });

  const mouseX = useMotionValue(0);
  const smoothMouseX = useSpring(mouseX, { stiffness: 30, damping: 20 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const normalizedX = (relativeX / rect.width) * 2 - 1;
      mouseX.set(normalizedX * 100);
    };
    container.addEventListener("mousemove", handleMouseMove);
    return () => container.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX]);

  useEffect(() => {
    const timer1 = setTimeout(() => setIntroPhase("line"), 500);
    const timer2 = setTimeout(() => setIntroPhase("circle"), 2500);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  const scatterPositions = useMemo(() => {
    return images.map((_, i) => ({
      // Deterministic pseudo-random scatter (index-hashed) — no Math.random so
      // SSR/static export hydrate cleanly.
      x: (((i * 137.5) % 100) / 100 - 0.5) * 1500,
      y: (((i * 91.7) % 100) / 100 - 0.5) * 1000,
      rotation: (((i * 53.3) % 100) / 100 - 0.5) * 180,
      scale: 0.6,
      opacity: 0,
    }));
  }, [images]);

  const [morphValue, setMorphValue] = useState(0);
  const [rotateValue, setRotateValue] = useState(0);
  const [parallaxValue, setParallaxValue] = useState(0);

  useEffect(() => {
    const unsubscribeMorph = smoothMorph.on("change", setMorphValue);
    const unsubscribeRotate = smoothScrollRotate.on("change", setRotateValue);
    const unsubscribeParallax = smoothMouseX.on("change", setParallaxValue);
    return () => {
      unsubscribeMorph();
      unsubscribeRotate();
      unsubscribeParallax();
    };
  }, [smoothMorph, smoothScrollRotate, smoothMouseX]);

  const contentOpacity = useTransform(smoothMorph, [0.8, 1], [0, 1]);
  const contentY = useTransform(smoothMorph, [0.8, 1], [20, 0]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-[var(--color-background)] overflow-hidden ${className ?? ""}`}
    >
      <div className="flex h-full w-full flex-col items-center justify-center perspective-1000">
        {/* Intro Text — visible from page load (fades as the arc forms) */}
        <div className="absolute z-0 flex flex-col items-center justify-center text-center pointer-events-none top-1/2 -translate-y-1/2 px-6">
          <motion.h1
            initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
            animate={
              morphValue < 0.5
                ? { opacity: 1 - morphValue * 2, y: 0, filter: "blur(0px)" }
                : { opacity: 0, filter: "blur(10px)" }
            }
            transition={{ duration: 1 }}
            className="[font-family:var(--font-display)] max-w-4xl text-4xl font-bold uppercase leading-[1.02] tracking-tight text-[var(--color-foreground)] md:text-6xl lg:text-7xl"
          >
            {introTitle}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={morphValue < 0.5 ? { opacity: 0.6 - morphValue } : { opacity: 0 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="mt-5 text-xs font-bold tracking-[0.25em] uppercase text-[var(--color-muted-foreground)]"
          >
            {introSub}
          </motion.p>
        </div>

        {/* Arc Active Content (fades in) */}
        <motion.div
          style={{ opacity: contentOpacity, y: contentY }}
          className="absolute top-[10%] z-10 flex flex-col items-center justify-center text-center pointer-events-none px-4"
        >
          <h2 className="[font-family:var(--font-display)] text-3xl md:text-5xl font-bold uppercase text-[var(--color-foreground)] tracking-tight mb-4">
            {arcTitle}
          </h2>
          <p className="text-sm md:text-base text-[var(--color-muted-foreground)] max-w-lg leading-relaxed">
            {arcSub}
          </p>
          {arcExtra ? (
            <div className="pointer-events-auto mt-6">{arcExtra}</div>
          ) : null}
        </motion.div>

        {/* Cards */}
        <div className="relative flex items-center justify-center w-full h-full">
          {images.slice(0, TOTAL_IMAGES).map((src, i) => {
            let target = { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 };

            if (introPhase === "scatter") {
              target = scatterPositions[i];
            } else if (introPhase === "line") {
              const lineSpacing = 70;
              const lineTotalWidth = TOTAL_IMAGES * lineSpacing;
              const lineX = i * lineSpacing - lineTotalWidth / 2;
              target = { x: lineX, y: 0, rotation: 0, scale: 1, opacity: 1 };
            } else {
              const isMobile = containerSize.width < 768;
              const minDimension = Math.min(containerSize.width, containerSize.height);

              const circleRadius = Math.min(minDimension * 0.35, 350);
              const circleAngle = (i / TOTAL_IMAGES) * 360;
              const circleRad = (circleAngle * Math.PI) / 180;
              const circlePos = {
                x: Math.cos(circleRad) * circleRadius,
                y: Math.sin(circleRad) * circleRadius,
                rotation: circleAngle + 90,
              };

              const baseRadius = Math.min(containerSize.width, containerSize.height * 1.5);
              const arcRadius = baseRadius * (isMobile ? 1.4 : 1.1);
              const arcApexY = containerSize.height * (isMobile ? 0.35 : 0.25);
              const arcCenterY = arcApexY + arcRadius;

              const spreadAngle = isMobile ? 100 : 130;
              const startAngle = -90 - spreadAngle / 2;
              const step = spreadAngle / (TOTAL_IMAGES - 1);

              const scrollProgress = Math.min(Math.max(rotateValue / 360, 0), 1);
              const maxRotation = spreadAngle * 0.8;
              const boundedRotation = -scrollProgress * maxRotation;

              const currentArcAngle = startAngle + i * step + boundedRotation;
              const arcRad = (currentArcAngle * Math.PI) / 180;

              const arcPos = {
                x: Math.cos(arcRad) * arcRadius + parallaxValue,
                y: Math.sin(arcRad) * arcRadius + arcCenterY,
                rotation: currentArcAngle + 90,
                scale: isMobile ? 1.4 : 1.8,
              };

              target = {
                x: lerp(circlePos.x, arcPos.x, morphValue),
                y: lerp(circlePos.y, arcPos.y, morphValue),
                rotation: lerp(circlePos.rotation, arcPos.rotation, morphValue),
                scale: lerp(1, arcPos.scale, morphValue),
                opacity: 1,
              };
            }

            return <FlipCard key={i} src={src} index={i} target={target} />;
          })}
        </div>
      </div>
    </div>
  );
}
