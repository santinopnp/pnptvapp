import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useId } from "react";
export function Modal({ isOpen, open, onClose, title, className = "", children }) {
    const visible = Boolean(open ?? isOpen);
    const titleId = useId();
    useEffect(() => {
        if (!visible)
            return;
        const onKey = (e) => {
            if (e.key === "Escape")
                onClose();
        };
        document.addEventListener("keydown", onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [visible, onClose]);
    if (!visible)
        return null;
    return _jsxs("div", {
        className: "fixed inset-0 z-50 flex items-center justify-center p-4",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": title ? titleId : undefined,
        children: [
            _jsx("div", {
                className: "absolute inset-0 bg-black/60 backdrop-blur-sm",
                onClick: onClose,
                "aria-hidden": "true",
            }),
            _jsxs("div", {
                className: `relative w-full max-w-md max-h-[85vh] overflow-y-auto bg-pnp-surface border border-pnp-border rounded-xl p-6 shadow-xl ${className}`,
                onClick: (e) => e.stopPropagation(),
                children: [
                    (title || onClose) && _jsxs("div", {
                        className: "flex items-center justify-between gap-4 mb-4",
                        children: [
                            _jsx("h2", {
                                id: titleId,
                                className: "text-lg font-bold text-pnp-textPrimary",
                                children: title,
                            }),
                            _jsx("button", {
                                type: "button",
                                onClick: onClose,
                                "aria-label": "Close",
                                className: "w-8 h-8 flex items-center justify-center rounded-lg text-pnp-textSecondary hover:text-pnp-textPrimary hover:bg-white/5 transition-colors",
                                children: "✕",
                            }),
                        ],
                    }),
                    children,
                ],
            }),
        ],
    });
}
