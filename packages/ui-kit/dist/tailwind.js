// PNPtv! Design System — Tailwind CSS preset
const preset = {
  theme: {
    extend: {
      colors: {
        pnp: {
          background: "#121212",
          surface: "#181818",
          surfaceRaised: "#1F1F1F",
          surfaceHover: "#2A2A2A",
          accent: "#D4007A",
          accentHover: "#E6198E",
          amber: "#E69138",
          lemon: "#FBFF00",
          textPrimary: "#F5F5F5",
          textSecondary: "#A1A1A3",
          textTertiary: "#8A8A8E",
          success: "#34C759",
          error: "#FF453A",
          warning: "#FFD60A",
          border: "#2A2A2A",
          controlBorder: "#707076",
          purple: "#A78BFA",
          night: "#0B1436",
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
