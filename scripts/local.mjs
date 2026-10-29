// Runs Gloopy on your own computer with no Supabase needed (test mode).
// Each browser tab is a different player. Friends on the same Wi-Fi can join too.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";

const require = createRequire(import.meta.url);
const next = require.resolve("next/dist/bin/next");
const port = process.env.PORT || "3000";

const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
console.log("\n  Gloopy (test mode, no Supabase)");
console.log(`  On this computer:   http://localhost:${port}`);
for (const ip of ips) console.log(`  Friends on Wi-Fi:   http://${ip}:${port}`);
console.log("  Open a NEW tab (not a duplicated tab) for each extra player. Stop with Ctrl+C.\n");

spawn(process.execPath, [next, "dev", "-H", "0.0.0.0", "-p", port], {
  stdio: "inherit",
  env: { ...process.env, GLOOPY_MEMORY_STORE: "1", NEXT_PUBLIC_GLOOPY_DEV: "1" },
}).on("exit", (code) => process.exit(code ?? 0));
