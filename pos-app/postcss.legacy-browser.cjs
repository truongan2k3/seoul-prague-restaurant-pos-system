/* eslint-disable @typescript-eslint/no-require-imports -- PostCSS loads CommonJS plugins at build time. */
const { transform } = require("lightningcss");

/** Tailwind 4's cascade layers are ignored altogether by older Android Chrome.
 * Supply a flattened, color-compatible copy only for browsers without dvh.
 * Current browsers keep the original layers and cascade unchanged.
 */
module.exports = () => ({
  postcssPlugin: "pos-legacy-browser-css",
  OnceExit(root, { result }) {
    if (!result.opts.from || !/[\\/]app[\\/]globals\.css$/.test(result.opts.from)) return;
    const legacy = root.clone();
    legacy.walkAtRules("layer", rule => {
      if (rule.nodes) rule.replaceWith(...rule.nodes);
      else rule.remove();
    });
    legacy.walkAtRules("property", rule => rule.remove());
    const compatible = transform({
      filename: result.opts.from,
      code: Buffer.from(legacy.toString()),
      targets: { chrome: 80 << 16 },
      minify: true,
    }).code.toString();
    root.append(`@supports not (height: 100dvh) { ${compatible} }`);
  },
});
module.exports.postcss = true;
