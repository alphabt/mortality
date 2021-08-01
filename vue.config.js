module.exports = {
  pages: {
    tab: {
      template: "public/browser-extension.html",
      entry: "./src/tab/tab.js",
      title: "New Tab",
      filename: "tab.html",
    },
  },
  pluginOptions: {
    browserExtension: {
      componentOptions: {},
    },
  },
};
