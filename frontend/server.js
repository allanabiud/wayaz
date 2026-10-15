// frontend/server.js
// Custom Next.js production server for DirectAdmin / LiteSpeed Web Server with Passenger.
// Supports process.env.PORT, LiteSpeed socket passing on file descriptor 0 (fd 0),
// and standalone fallback on port 3000.

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const defaultPort = 3000;

const app = next({ dev, hostname, port: defaultPort });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling request:", req.url, err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  const port = process.env.PORT;

  if (port) {
    server.listen(port, (err) => {
      if (err) throw err;
      console.log(`> Next.js production server listening on port ${port}`);
    });
  } else {
    // Under LiteSpeed Web Server without PORT, the listener socket is passed via fd 0
    try {
      server.listen({ fd: 0 }, (err) => {
        if (err) {
          console.warn("> Listening on fd 0 failed, falling back to port 3000", err);
          server.listen(defaultPort, () => {
            console.log(`> Next.js fallback listening on port ${defaultPort}`);
          });
        } else {
          console.log("> Next.js production server listening on fd 0 (LiteSpeed)");
        }
      });
    } catch (err) {
      console.warn("> Failed to bind fd 0, falling back to port 3000", err);
      server.listen(defaultPort, () => {
        console.log(`> Next.js fallback listening on port ${defaultPort}`);
      });
    }
  }
});
