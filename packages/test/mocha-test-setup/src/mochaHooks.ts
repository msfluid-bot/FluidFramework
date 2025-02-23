/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBufferedLogger } from "@fluidframework/test-driver-definitions";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import * as mochaModule from "mocha";
import { pkgName } from "./packageVersion";

const testVariant = process.env.FLUID_TEST_VARIANT;

const _global: any = global;
class TestLogger implements ITelemetryBufferedLogger {
	send(event: ITelemetryBaseEvent) {
		// TODO: Remove when issue #7061 is resolved.
		// Don't log this event as we generate too much.
		if (event.eventName === "fluid:telemetry:RouterliciousDriver:readBlob_end") {
			return;
		}

		event.testName = this.testName;
		event.testVariant = testVariant;
		event.hostName = pkgName;
		this.parentLogger.send(event);
	}
	async flush() {
		return this.parentLogger.flush();
	}
	constructor(
		private readonly parentLogger: ITelemetryBufferedLogger,
		private readonly testName: string | undefined,
	) {}
}
const nullLogger: ITelemetryBufferedLogger = {
	send: () => {},
	flush: async () => {},
};

const log = console.log;
const error = console.log;
const warn = console.warn;
let currentTestLogger: ITelemetryBufferedLogger | undefined;
let currentTestName: string | undefined;
let originalLogger: ITelemetryBufferedLogger;
export const mochaHooks = {
	beforeAll() {
		originalLogger = _global.getTestLogger?.() ?? nullLogger;
		_global.getTestLogger = () => {
			// If a current test logger exists, use that. Otherwise, create a new one. This should become the
			// current test logger if this function is running in a context which understands the current test.
			// Otherwise, just return the created TestLogger. (This happens e.g. if someone calls `getTestLogger`
			// in a `before` or `after` hook, due to the order in which mocha hooks run)
			if (currentTestLogger !== undefined) {
				return currentTestLogger;
			}

			const testLogger = new TestLogger(originalLogger, currentTestName);
			if (currentTestName !== undefined) {
				currentTestLogger = testLogger;
			}

			return testLogger;
		};
	},
	beforeEach(this: Mocha.Context) {
		// Suppress console.log if not verbose mode
		if (process.env.FLUID_TEST_VERBOSE === undefined) {
			console.log = () => {};
			console.error = () => {};
			console.warn = () => {};
		}
		// save the test name can and clear the previous logger (if afterEach didn't get ran and it got left behind)
		currentTestName = this.currentTest?.fullTitle();
		currentTestLogger = undefined;

		// send event on test start
		originalLogger.send({
			category: "generic",
			eventName: "fluid:telemetry:Test_start",
			testName: currentTestName,
			testVariant,
			hostName: pkgName,
		});
	},
	afterEach(this: Mocha.Context) {
		// send event on test end
		originalLogger.send({
			category: "generic",
			eventName: "fluid:telemetry:Test_end",
			testName: currentTestName,
			state: this.currentTest?.state,
			duration: this.currentTest?.duration,
			timedOut: this.currentTest?.timedOut,
			testVariant,
			hostName: pkgName,
		});

		console.log = log;
		console.error = error;
		console.warn = warn;

		// clear the test logger and test name after each test
		currentTestLogger = undefined;
		currentTestName = undefined;
	},
};

globalThis.getMochaModule = () => {
	return mochaModule;
};
