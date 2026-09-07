import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function StepDots({ total, current, className = "" }) {
    return _jsx("div", {
        className: `flex items-center gap-2 ${className}`,
        children: Array.from({ length: total }, (_, i) => _jsx("div", {
            className: `rounded-full transition-all duration-200 ${i === current
                ? "w-6 h-2 bg-pnp-accent"
                : "w-2 h-2 bg-pnp-border"}`,
        }, i))
    });
}
