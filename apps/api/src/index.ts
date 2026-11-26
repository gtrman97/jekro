import { createApp } from "./server.ts";

createApp().listen(3000, "127.0.0.1", () => {
  console.log("Jekro API listening at http://127.0.0.1:3000");
});
