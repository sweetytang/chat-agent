export default {
  extends: ['stylelint-config-standard', 'stylelint-config-css-modules'],
  ignoreFiles: ['dist/**'],
  rules: {
    'custom-property-pattern': null,
    'selector-class-pattern': null,
  },
};
