async function main(): Promise<void> {
  if (process.platform !== "win32") {
    console.error("o app de bandeja roda só no Windows; nos outros sistemas use npm run battery-led");
    process.exit(1);
  }
  const selfTestAt = process.argv.indexOf("--self-test");
  if (selfTestAt !== -1) {
    const { selfTest } = await import("./self-test.js");
    process.exit((await selfTest(process.argv[selfTestAt + 1] ?? "self-test.json")) ? 0 : 1);
  }
  const { runTray } = await import("./app.js");
  await runTray();
}

void main();
