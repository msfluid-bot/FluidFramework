/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "console";
import registerDebug from "debug";
import * as path from "path";

import { defaultLogger } from "../../../common/logging";
import { ScriptDependencies } from "../../../common/npmPackage";
import { globFn, readFileAsync, statAsync, toPosixPath, unquote } from "../../../common/utils";
import { getPackageDetails } from "../../../typeValidator/packageJson";
import { BuildPackage } from "../../buildGraph";
import { LeafTask, LeafWithDoneFileTask } from "./leafTask";

/* eslint-disable @typescript-eslint/no-empty-function */

const { verbose } = defaultLogger;

export class EchoTask extends LeafTask {
	protected addDependentTasks(dependentTasks: LeafTask[]) {}
	protected async checkLeafIsUpToDate() {
		return true;
	}
}

export class LesscTask extends LeafTask {
	protected addDependentTasks(dependentTasks: LeafTask[]) {}
	protected async checkLeafIsUpToDate() {
		// TODO: assume lessc <src> <dst>
		const args = this.command.split(" ");
		if (args.length !== 3) {
			return false;
		}
		const srcPath = unquote(args[1]);
		const dstPath = unquote(args[2]);
		try {
			const srcTimeP = statAsync(path.join(this.node.pkg.directory, srcPath));
			const dstTimeP = statAsync(path.join(this.node.pkg.directory, dstPath));
			const [srcTime, dstTime] = await Promise.all([srcTimeP, dstTimeP]);
			const result = srcTime <= dstTime;
			if (!result) {
				this.logVerboseNotUpToDate();
			}
			return result;
		} catch (e: any) {
			verbose(`${this.node.pkg.nameColored}: ${e.message}`);
			this.logVerboseTrigger("failed to get file stats");
			return false;
		}
	}
}

const traceCopyFileTrigger = registerDebug("fluid-build:task:trigger:copyfiles");

export class CopyfilesTask extends LeafWithDoneFileTask {
	private parsed: boolean = false;
	private readonly upLevel: number = 0;
	private readonly copySrcArg: string = "";
	private readonly copyDstArg: string = "";

	constructor(node: BuildPackage, command: string, scriptDeps: ScriptDependencies) {
		super(node, command, scriptDeps);

		// TODO: something better
		const args = this.command.split(" ");

		for (let i = 1; i < args.length; i++) {
			// Only handle -u arg
			if (args[i] === "-u" || args[i] === "--up") {
				if (i + 1 >= args.length) {
					return;
				}
				this.upLevel = parseInt(args[i + 1]);
				i++;
				continue;
			}
			if (this.copySrcArg === "") {
				this.copySrcArg = unquote(args[i]);
			} else if (this.copyDstArg === "") {
				this.copyDstArg = unquote(args[i]);
			} else {
				return;
			}
		}

		this.parsed = true;
	}

	protected addDependentTasks(dependentTasks: LeafTask[]) {
		if (this.parsed) {
			if (this.copySrcArg.startsWith("src")) {
				return;
			}

			if (this.copySrcArg.startsWith("./_api-extractor-temp/doc-models/")) {
				this.addChildTask(dependentTasks, this.node, "api-extractor run --local");
				return;
			}
		}
		this.addAllDependentPackageTasks(dependentTasks);
	}

	private _srcFiles: string[] | undefined;
	private _dstFiles: string[] | undefined;
	private async getCopySourceFiles() {
		assert(this.parsed);
		if (!this._srcFiles) {
			const srcGlob = path.join(this.node.pkg.directory, this.copySrcArg!);
			this._srcFiles = await globFn(srcGlob, { nodir: true });
		}
		return this._srcFiles;
	}

	private async getCopyDestFiles() {
		assert(this.parsed);
		if (!this._dstFiles) {
			const directory = toPosixPath(this.node.pkg.directory);
			const dstPath = directory + "/" + this.copyDstArg;
			const srcFiles = await this.getCopySourceFiles();
			this._dstFiles = srcFiles.map((match) => {
				const relPath = path.relative(directory, match);
				let currRelPath = relPath;
				for (let i = 0; i < this.upLevel; i++) {
					const index = currRelPath.indexOf(path.sep);
					if (index === -1) {
						break;
					}
					currRelPath = currRelPath.substring(index + 1);
				}

				return path.join(dstPath, currRelPath);
			});
		}

		return this._dstFiles;
	}

	protected async getDoneFileContent(): Promise<string | undefined> {
		if (!this.parsed) {
			// If we can't parse the argument, we don't know what we are doing.
			this.logVerboseTask(`error parsing command line`);
			return undefined;
		}

		const srcFiles = await this.getCopySourceFiles();
		const dstFiles = await this.getCopyDestFiles();

		// Gather the file informations
		try {
			const srcTimesP = Promise.all(srcFiles.map((match) => statAsync(match)));
			const dstTimesP = Promise.all(dstFiles.map((match) => statAsync(match)));
			const [srcTimes, dstTimes] = await Promise.all([srcTimesP, dstTimesP]);

			const srcInfo = srcTimes.map((srcTime) => {
				return { mtimeMs: srcTime.mtimeMs, size: srcTime.size };
			});
			const dstInfo = dstTimes.map((dstTime) => {
				return { mtimeMs: dstTime.mtimeMs, size: dstTime.size };
			});
			return JSON.stringify({ srcFiles, dstFiles, srcInfo, dstInfo });
		} catch (e: any) {
			this.logVerboseTask(`error comparing file times ${e.message}`);
			this.logVerboseTrigger("failed to get file stats");
			return undefined;
		}
	}
}

export class GenVerTask extends LeafTask {
	protected addDependentTasks(dependentTasks: LeafTask[]) {}
	protected async checkLeafIsUpToDate() {
		const file = path.join(this.node.pkg.directory, "src/packageVersion.ts");
		try {
			const content = await readFileAsync(file, "utf8");
			const match = content.match(
				/.*\nexport const pkgName = "(.*)";[\n\r]*export const pkgVersion = "([0-9A-Za-z.+-]+)";.*/m,
			);
			if (match === null) {
				this.logVerboseTrigger("src/packageVersion.ts content not matched");
				return false;
			}
			if (this.node.pkg.name !== match[1]) {
				this.logVerboseTrigger("package name in src/packageVersion.ts not matched");
				return false;
			}
			if (this.node.pkg.version !== match[2]) {
				this.logVerboseTrigger("package version in src/packageVersion.ts not matched");
				return false;
			}
			return true;
		} catch {
			this.logVerboseTrigger(`failed to read src/packageVersion.ts`);
			return false;
		}
	}
}

export class TypeValidationTask extends LeafWithDoneFileTask {
	protected async getDoneFileContent(): Promise<string | undefined> {
		const details = await getPackageDetails(this.package.directory);
		const content =
			JSON.stringify(this.package.packageJson) + JSON.stringify(details.typeValidation);
		return content;
	}

	protected addDependentTasks(dependentTasks: LeafTask[]): void {}
}
