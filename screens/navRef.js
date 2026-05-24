import { createRef } from 'react';

export const navigationRef = createRef();

if (typeof window !== 'undefined') {
  window.__nav = {
    navigate: (name) => navigationRef.current?.navigate(name),
    reset: (state) => navigationRef.current?.reset(state),
  };
}
