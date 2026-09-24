// react-dom ships with react-native-web but without type declarations here;
// the signing sheets only need createPortal.
declare module 'react-dom' {
  import type { ReactNode, ReactPortal } from 'react';
  export function createPortal(children: ReactNode, container: Element | DocumentFragment): ReactPortal;
}
