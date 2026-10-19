import { jsx as _jsx } from "react/jsx-runtime";
export function Skeleton({ width, height, className = "", style, ...rest }) {
    return _jsx("div", {
        "aria-hidden": "true",
        className: `animate-pulse rounded-md bg-pnp-surfaceHover ${className}`,
        style: { width, height, ...style },
        ...rest,
    });
}
