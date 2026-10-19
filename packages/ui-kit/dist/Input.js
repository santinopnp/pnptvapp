import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useId } from "react";
export function Input({ label, error, id, className = "", ...rest }) {
    const autoId = useId();
    const inputId = id || autoId;
    const errorId = error ? `${inputId}-error` : undefined;
    return _jsxs("div", {
        className: "w-full",
        children: [
            label && _jsx("label", {
                htmlFor: inputId,
                className: "block text-sm font-medium text-pnp-textSecondary mb-1.5",
                children: label,
            }),
            _jsx("input", {
                id: inputId,
                "aria-invalid": error ? true : undefined,
                "aria-describedby": errorId,
                className: `w-full h-10 px-3 rounded-lg bg-pnp-background text-pnp-textPrimary placeholder:text-pnp-textSecondary/60 border ${error ? "border-pnp-error" : "border-pnp-border"} focus:outline-none focus:border-pnp-accent transition-colors duration-150 disabled:opacity-50 ${className}`,
                ...rest,
            }),
            error && _jsx("p", {
                id: errorId,
                className: "mt-1 text-xs text-pnp-error",
                children: error,
            }),
        ],
    });
}
