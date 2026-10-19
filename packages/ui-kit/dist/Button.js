import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const VARIANTS = {
    primary: "bg-pnp-accent text-white hover:bg-pnp-accentHover",
    secondary: "bg-pnp-surface text-pnp-textPrimary border border-pnp-border hover:bg-pnp-surfaceHover",
    ghost: "bg-transparent text-pnp-textSecondary hover:bg-white/5 hover:text-pnp-textPrimary",
    danger: "bg-pnp-error text-white hover:opacity-90",
};
const SIZES = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
};
export function Button({ variant = "primary", size = "md", loading = false, disabled, type = "button", className = "", children, ...rest }) {
    return _jsxs("button", {
        type,
        disabled: disabled || loading,
        "aria-busy": loading || undefined,
        className: `inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-pnp-accent disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`,
        ...rest,
        children: [
            loading && _jsx("span", {
                className: "w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin",
                "aria-hidden": "true",
            }),
            children,
        ],
    });
}
