// Preset de ESLint compartido por ambas apps y paquetes.
// Cada app/paquete extiende esto en su propio .eslintrc.js
module.exports = {
  root: true,
  extends: ["expo", "prettier"],
  plugins: ["prettier"],
  rules: {
    "prettier/prettier": "warn",
    "no-unused-vars": "warn",
    // Reglas del React Compiler (eslint-config-expo 57): son recomendaciones de
    // refactor, no errores de ejecución. Se dejan como aviso para no reescribir la UI.
    "react-hooks/refs": "warn",
    "react-hooks/set-state-in-effect": "warn",
  },
};
