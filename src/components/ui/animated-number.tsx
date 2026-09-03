import { useEffect, useRef } from "react";
import { useSpring, motion, useMotionValue } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export function AnimatedNumber({
  value,
  prefix = "",
  suffix = "",
  className,
}: AnimatedNumberProps) {
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.01,
  });
  const ref = useRef<HTMLSpanElement>(null);

  // Update the motion value when the value prop changes
  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  // Update DOM directly on each spring frame for smooth rendering
  useEffect(() => {
    const unsubscribe = springValue.on("change", (latest) => {
      if (ref.current) {
        ref.current.textContent = `${prefix}${Math.round(latest).toLocaleString()}${suffix}`;
      }
    });
    return unsubscribe;
  }, [springValue, prefix, suffix]);

  return (
    <motion.span
      ref={ref}
      className={className}
      aria-label={`${prefix}${value}${suffix}`}
    >
      {prefix}{Math.round(value).toLocaleString()}{suffix}
    </motion.span>
  );
}
