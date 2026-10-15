// frontend/server.js
// Custom Next.js production server for DirectAdmin / LiteSpeed Web Server with Passenger.
// Supports process.env.PORT, LiteSpeed socket passing on file descriptor 0 (fd 0),
// and standalone fallback on port 3000.

// Default NODE_ENV to production before Next loads; this file serves only
// built code, so a panel that forgets it can never boot the dev compiler.
process.env.NODE_ENV = process.env.NODE_ENV || "production";

const { createServer } = require("http");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const defaultPort = 3000;

const app = next({ dev, hostname, port: defaultPort });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      // Next parses the URL itself; url.parse() is deprecated (DEP0169).
      await handle(req, res);
    } catch (err) {
      console.error("Error occurred handling request:", req.url, err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  const port = process.env.PORT;

  if (port) {
    // listen() failures arrive via the "error" event, not the callback.
    server.once("error", (err) => {
      console.error(`> Failed to listen on port ${port}: ${err.message}`);
      process.exit(1);
    });
    server.listen(port, () => {
      console.log(`> Next.js production server listening on port ${port}`);
    });
  } else {
    const fallbackToPort = () => {
      server.once("error", (err) => {
        console.error(
          `> Failed to listen on port ${defaultPort}: ${err.message}`,
        );
        process.exit(1);
      });
      server.listen(defaultPort, () => {
        console.log(`> Next.js fallback listening on port ${defaultPort}`);
      });
    };

    // LiteSpeed passes the listener socket via fd 0; bad fds usually surface
    // async, so a one-shot handler falls back to the port.
    const onFd0Error = (err) => {
      console.warn(
        `> Listening on fd 0 failed (${err.message}), falling back to port ${defaultPort}`,
      );
      fallbackToPort();
    };

    try {
      server.once("error", onFd0Error);
      server.listen({ fd: 0 }, () => {
        server.removeListener("error", onFd0Error);
        console.log(
          "> Next.js production server listening on fd 0 (LiteSpeed)",
        );
      });
    } catch (err) {
      server.removeListener("error", onFd0Error);
      console.warn(
        `> Failed to bind fd 0 (${err.message}), falling back to port ${defaultPort}`,
      );
      fallbackToPort();
    }
  }
});
