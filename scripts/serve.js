const http = require("http");
const fs = require("fs");
const path = require("path");

let PORT = process.env.PORT || 8080;
const FRONTEND_DIR = path.join(__dirname, "../frontend");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

function startServer(portToTry) {
  const server = http.createServer((req, res) => {
    let reqUrl = req.url.split("?")[0];
    if (reqUrl === "/") reqUrl = "/index.html";

    const safePath = path.normalize(reqUrl).replace(/^(\.\.[\/\\])+/, "");
    let filePath = path.join(FRONTEND_DIR, safePath);

    if (!fs.existsSync(filePath) && safePath.startsWith("/data")) {
      filePath = path.join(__dirname, "..", safePath);
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    fs.readFile(filePath, (err, content) => {
      if (err) {
        if (err.code === "ENOENT") {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end(`404 Not Found: ${reqUrl}`);
        } else {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end(`500 Server Error: ${err.code}`);
        }
      } else {
        res.writeHead(200, {
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache",
        });
        res.end(content, "utf-8");
      }
    });
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`Port ${portToTry} in use, trying ${portToTry + 1}...`);
      startServer(portToTry + 1);
    } else {
      console.error("Server error:", err);
    }
  });

  server.listen(portToTry, () => {
    console.log("==========================================");
    console.log(" Proof-of-Reserves Demo Web Server");
    console.log("==========================================");
    console.log(` Web App Running at: http://localhost:${portToTry}`);
    console.log("==========================================");
  });
}

if (require.main === module) {
  startServer(PORT);
}

module.exports = { startServer };
