const { spawn } = require("child_process");

const start_server = () => {
  const ls = spawn("node", ["server/index.js"]);

  ls.stdout.on("data", (data) => {
    console.log(`Server: ${data}`);
  });

  ls.stderr.on("data", (data) => {
    console.error(`Server: ${data}`);
  });

  ls.on("close", (code) => {
    console.log(
      "Server: Server stopped (probably it's fine - just settings change). Restarting..."
    );
    start_server();
  });
};

const start_App = () => {
  const ls = spawn("serve", ["-s", "App"]);

  ls.stdout.on("data", (data) => {
    console.log(`App: ${data}`);
  });

  ls.stderr.on("data", (data) => {
    console.error(`App: ${data}`);
  });

  ls.on("close", (code) => {
    console.log("App: Something is wrong with App. Restarting...");
    start_App();
  });
};

start_server();
start_App();
