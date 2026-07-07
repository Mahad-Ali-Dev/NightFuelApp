// react-three-fiber v9 + React 19: teach TSX about the r3f intrinsic elements
// (<mesh>, <planeGeometry>, <ambientLight>, …).
//
// The augmentation MUST cover every module the JSX factory can resolve
// IntrinsicElements from — `react`, `react/jsx-runtime`, and
// `react/jsx-dev-runtime`. Augmenting only `react` leaves the automatic
// (`react-jsx`) runtime with a partial interface and collapses DOM element
// children to `never`, so all three are declared here to mirror fiber's own
// three-types.d.ts.
import type { ThreeElements } from '@react-three/fiber';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

declare module 'react/jsx-dev-runtime' {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

export {};
