const { createProxyMiddleware } = require("http-proxy-middleware");

const proxyOptions = {
  target: process.env.API_PROXY_HOST || "http://localhost:8877",
  changeOrigin: true,
  xfwd: true,
  onProxyRes: (proxyRes, req, res) => {
    proxyRes["Access-Control-Allow-Origin"] = "*";
  },
};

const createWebsocketProxy = (path) => {
  return createProxyMiddleware([path], {
    ...proxyOptions,
    ws: true,
    onProxyReqWs: (proxyReq, req, socket) => socket.on("error", console.error), // Subscribing here means the proxy doesn't die on websocket errors
  });
};

module.exports = function (app) {
  app.use(createProxyMiddleware("/api", proxyOptions));
  app.use(createProxyMiddleware("/ws/*/api/**", proxyOptions));
  app.use(createProxyMiddleware("/embed", proxyOptions));
  app.use(createProxyMiddleware("/auth", proxyOptions));
  app.use(createProxyMiddleware("/apps", proxyOptions));
  if (proxyOptions.target.includes("localhost")) {
    app.use(createProxyMiddleware("/-/", proxyOptions));
  }
  app.use(createWebsocketProxy("/ws/*/api/kernels/*/channels"));
  app.use(createWebsocketProxy("/ws/*/api/sl-app/*/_stcore/stream"));
  app.use(createWebsocketProxy("/ws/*/nks/connect/*"));
  app.use(createWebsocketProxy("/ws/*/nks/runpy/*"));
};
