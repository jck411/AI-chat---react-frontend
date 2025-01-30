import { useEffect, useRef } from 'react';

export const useAutoScroll = (dependency, shouldScroll = true) => {
  const scrollRef = useRef(null);
  const userScrollRef = useRef(true);

  useEffect(() => {
    const handleScroll = () => {
      if (!scrollRef.current) return;
      
      const { scrollHeight, scrollTop, clientHeight } = scrollRef.current;
      const isScrolledToBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 50;
      userScrollRef.current = isScrolledToBottom;
    };

    const element = scrollRef.current;
    if (element) {
      element.addEventListener('scroll', handleScroll);
      return () => element.removeEventListener('scroll', handleScroll);
    }
  }, []);

  useEffect(() => {
    if (!scrollRef.current || !shouldScroll || !userScrollRef.current) return;

    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth'
    });
  }, [dependency, shouldScroll]);

  return scrollRef;
};
