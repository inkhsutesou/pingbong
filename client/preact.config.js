const TerserPlugin = require('terser-webpack-plugin');
const WebpackObfuscator = require('webpack-obfuscator');
import envVars from 'preact-cli-plugin-env-vars';
import tailwindcss from 'tailwindcss';

module.exports = (config, env, helpers, params = defaultParams) => {
  envVars(config, env, helpers);

  if(config.optimization.minimizer) {
    config.output.publicPath = "/pingbong/";
  }

  config.module.rules.push({
      test: /\.mp3$/,
      //include: SRC,
      loader: 'file-loader'
  });

  config.module.rules.push({
    test: /\.glsl$/,
    //include: SRC,
    loader: 'raw-loader'
  });

  const postCssLoaders = helpers.getLoadersByName(config, 'postcss-loader');
  postCssLoaders.forEach(({ loader }) => {
    const plugins = loader.options.plugins;

    // Add tailwind css at the top.
    plugins.unshift(tailwindcss('./tailwind.config.js'));
  });

  if(config.optimization.minimizer) {
    // Replace terser
    config.optimization.minimizer.shift();
    config.optimization.minimizer.push(new TerserPlugin({
      cache: true,
      parallel: true,
      terserOptions: {
        output: { comments: false },
        mangle: {properties:{regex:/^_|^sendByte|^prepareRender|^endRender|^tick|^boundingRect|^spin|^rebalance|^wAngle|^getUint8|^getFloat32/}},
        compress: {
          keep_fargs: false,
          unsafe: true,
          pure_getters: true,
          hoist_funs: true,
          drop_console: true,
          pure_funcs: [
            'classCallCheck',
            '_classCallCheck',
            '_possibleConstructorReturn',
            'Object.freeze',
            'invariant',
            'warning',
          ],
        },
        ecma: 2015,
      },
      extractComments: false,
      sourceMap: false,//true,
    }));
    config.plugins.push(new WebpackObfuscator({
      rotateStringArray: true,
      identifierNamesGenerator: 'mangled-shuffled',
      debugProtection: false,
      reservedStrings: ['Math.*'],
      renameGlobals: true,
      //stringArrayEncoding: ['base64'],
      simplify: false,
      compact: true,
      splitStrings: false,
      target: 'browser',
    }));
  }
  return config;
};
