// PNPtv! Design System — Tailwind CSS preset
const preset = {
  theme: {
    extend: {
      colors: {
        pnp: {
          background: "#121212",
          surface: "#1E1E1E",
          surfaceHover: "#2A2A2A",
          accent: "#D4007A",
          accentHover: "#E6198E",
          amber: "#E69138",
          lemon: "#FBFF00",
          textPrimary: "#FFFFFF",
          textSecondary: "#A1A1A3",
          success: "#E69138",
          error: "#FF453A",
          warning: "#FFD60A",
          border: "#2A2A2A",
          purple: "#A78BFA",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "8px",
        sm: "4px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
    },
  },
};

module.exports = preset;
