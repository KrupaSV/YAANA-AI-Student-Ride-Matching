import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";

function progressX() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  const left = 22;
  const right = window.innerWidth - 22;
  return left + progress * (right - left);
}

export default function CursorAuto() {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  const x = useMotionValue(22);
  const smoothX = useSpring(x, { stiffness: 22, damping: 32, mass: 1.8, restDelta: 0.2 });
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (reduce) return undefined;

    function goTo() {
      x.set(progressX());
    }

    goTo();
    setEnabled(true);

    window.addEventListener("scroll", goTo, { passive: true });
    window.addEventListener("resize", goTo, { passive: true });
    return () => {
      window.removeEventListener("scroll", goTo);
      window.removeEventListener("resize", goTo);
    };
  }, [pathname, reduce, x]);

  if (reduce || !enabled) return null;

  return (
    <motion.div
      className="page-auto"
      aria-hidden="true"
      style={{ x: smoothX }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <span>🛺</span>
    </motion.div>
  );
}
