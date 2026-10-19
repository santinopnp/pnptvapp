import { jsx as _jsx } from "react/jsx-runtime";
const VARIANTS = {
    default: "bg-white/10 text-pnp-textSecondary",
    success: "bg-green-500/15 text-green-400",
    warning: "bg-pnp-warning/15 text-pnp-warning",
    danger: "bg-pnp-error/15 text-pnp-error",
    error: "bg-pnp-error/15 text-pnp-error",
    info: "bg-blue-500/15 text-blue-400",
    accent: "bg-pnp-accent/15 text-pnp-accent",
};
export function Badge({ variant = "default", className = "", children, ...rest }) {
    return _jsx("span", {
        className: `inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${VARIANTS[variant] || VARIANTS.default} ${className}`,
        ...rest,
        children,
    });
}
