/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const esb = require("esbuild");
const fs = require("fs-extra");
const globby = require("globby");
const shell = require("shelljs");

// const { program } = require("commander");

// program
//    .option("-d, --debug", "output extra debugging")
//    .option("-s, --small", "small pizza size")
//    .option("-p, --pizza-type <type>", "flavour of pizza");

const build = async (mode, globs) => {
    if (mode === "commonjs") {
        esb.build({
            entryPoints: await globby(globs),
            tsconfig: "tsconfig.json",
            target: ["es2017"],
            outbase: "src",
            outdir: "dist",
            format: "cjs",
            sourcemap: true,
            logLevel: "warning",
            logLimit: 50,
            metafile: true,
        }).catch(() => process.exit(1));
    } else if (mode === "test" && fs.existsSync("src/test/tsconfig.json")) {
        esb.build({
            entryPoints: await globby(globs),
            tsconfig: "src/test/tsconfig.json",
            target: ["es2017"],
            outbase: "src",
            outdir: "dist",
            format: "cjs",
            sourcemap: true,
            logLevel: "warning",
            logLimit: 50,
            metafile: true,
        }).catch(() => process.exit(1));
    } else if (mode === "esnext" && fs.existsSync("tsconfig.esnext.json")) {
        esb.build({
            entryPoints: await globby(globs),
            tsconfig: "tsconfig.esnext.json",
            target: ["es2020"],
            outbase: "src",
            outdir: "lib",
            format: "esm",
            sourcemap: true,
            logLevel: "warning",
            logLimit: 50,
            metafile: true,
        }).catch(() => process.exit(1));
    }
}

const start = async () => {
    const src = ["src/**/*.ts", "src/**/*.tsx", "!src/**/*.d.ts", "!src/test/**"];
    const test = ["src/test/**/*.ts", "src/test/**/*.tsx", "!src/test/**/*.d.ts"];

    await build("commonjs", src);
    await build("esnext", src);
    await build("test", test);

    if (process.argv.length >= 3) {
        console.log(`Skipping type generation.`);
    } else {
        const result = shell.exec("npm run tsc -- --emitDeclarationOnly").code;
        if (result !== 0 && result !== undefined) {
            shell.echo(`Error: ${result}`);
        }
    }
}

start().catch(err => console.error(err));
