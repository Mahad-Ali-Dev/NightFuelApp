// styled-jsx JSX prop augmentation.
//
// The app uses `<style jsx global>{`...`}</style>` (styled-jsx, bundled with
// Next). Those `jsx` / `global` props are added to React's StyleHTMLAttributes
// by styled-jsx's types, which Next normally wires up via `next typegen`. In CI,
// `next typegen` shells out to the runner's global yarn and fails, so the
// augmentation isn't present and `tsc --noEmit` errors with TS2322 on `<style
// jsx global>`. Declaring it explicitly here makes the type valid independent of
// typegen (the declarations merge, so this is additive and safe locally too).
import 'react';

declare module 'react' {
  interface StyleHTMLAttributes<T> extends HTMLAttributes<T> {
    jsx?: boolean;
    global?: boolean;
  }
}
