module.exports = {
  future: {
    // defaultLineHeights: true,
    standardFontWeights: true,
    // removeDeprecatedGapUtilities: true,
    // purgeLayersByDefault: true,
  },
  purge: ["./views/**/*.hbs"],
  theme: {
    borderColor: (theme) => ({
      ...theme("colors"),
      default: theme("colors.gray.200"),
    }),
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
