// src/hooks/useResizeObserver.js
import { useState, useEffect, useCallback } from 'react';

const useResizeObserver = () => {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [element, setElement] = useState(null);

  const ref = useCallback((node) => {
    if (node !== null) {
      setElement(node);
    }
  }, []);

  useEffect(() => {
    if (!element) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });

    resizeObserver.observe(element);
    
    // Initial measurement
    setSize({
      width: element.offsetWidth,
      height: element.offsetHeight
    });

    return () => resizeObserver.disconnect();
  }, [element]);

  return [ref, size];
};

export default useResizeObserver;
