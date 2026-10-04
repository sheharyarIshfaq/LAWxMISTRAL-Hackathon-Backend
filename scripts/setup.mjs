// Runs after `npm install` at the root: installs both apps and creates their env files from the examples.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";

for (const app of ["backend", "frontend"]) {
  console.log(`\n> Installing ${app} dependencies`);
  execSync("npm install", { cwd: app, stdio: "inherit" });
}

for (const [example, target] of [
  ["backend/.env.example", "backend/.env"],
  ["frontend/.env.example", "frontend/.env.local"],
]) {
  if (!existsSync(target)) {
    copyFileSync(example, target);
    console.log(`Created ${target} from ${example}`);
  }
}
console.log("\nDone. Put your MISTRAL_API_KEY in backend/.env, then run: npm run dev");
