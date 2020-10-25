module.exports = {
  future: {
    // defaultLineHeights: true,
    standardFontWeights: true,
    // removeDeprecatedGapUtilities: true,
    // purgeLayersByDefault: true,
  },
  purge: ["./views/**/*.hbs"],
  theme: {
    container: {
      padding: {
        default: "1rem",
        sm: "2rem",
        lg: "4rem",
        xl: "5rem",
      },
    },
    extend: {},
  },
  variants: {},
  plugins: [],
  experimental: "all",
};
