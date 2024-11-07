const { createProxyMiddleware } = require("http-proxy-middleware");

const proxyOptions = {
  target: process.env.API_PROXY_HOST || "http://localhost:8877",
  changeOrigin: true,
  xfwd: true,
  onProxyRes: (proxyRes, req, res) => {
    proxyRes["Access-Control-Allow-Origin"] = "*";
  },
};

module.exports = function (app) {
  app.use(createProxyMiddleware("/api", proxyOptions));
};
