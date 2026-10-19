import { jsx as _jsx } from "react/jsx-runtime";
export function Card({ hover = false, className = "", children, ...rest }) {
    const interactive = hover || typeof rest.onClick === "function";
    return _jsx("div", {
        className: `bg-pnp-surface border border-pnp-border rounded-xl p-4 ${interactive ? "transition-colors duration-150 hover:bg-pnp-surfaceHover cursor-pointer" : ""} ${className}`,
        ...rest,
        children,
    });
}
