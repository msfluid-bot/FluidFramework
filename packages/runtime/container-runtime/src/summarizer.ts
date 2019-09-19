/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentLoadable } from "@prague/component-core-interfaces";
import { ISequencedDocumentMessage, ISummaryConfiguration, MessageType } from "@prague/protocol-definitions";
import { Deferred } from "@prague/utils";
import { ContainerRuntime } from "./containerRuntime";
import { debug } from "./debug";

/**
 * Wrapper interface holding summary details for a given op
 */
interface IOpSummaryDetails {
    // Whether we should summarize at the given op
    shouldSummarize: boolean;

    // The message to include with the summarize
    message: string;
}

declare module "@prague/component-core-interfaces" {
    export interface IComponent extends Readonly<Partial<IProvideSummarizer>> { }
}

export interface IProvideSummarizer {
    readonly ISummarizer: ISummarizer;
}

export interface ISummarizer extends IProvideSummarizer {
    /**
     * Runs the summarizer on behalf of another clientId. In this case it will only run so long as the given
     * clientId is the elected summarizer and will stop once it is not.
     */
    run(onBehalfOf: string): Promise<void>;
}

export class Summarizer implements IComponentLoadable, ISummarizer {

    public get ISummarizer() { return this; }
    public get IComponentLoadable() { return this; }

    // Use the current time on initialization since we will be loading off a summary
    private lastSummaryTime: number = Date.now();
    private lastSummarySeqNumber: number = 0;
    private summarizing = false;
    private idleTimer: NodeJS.Timeout | null = null;
    private lastOp: ISequencedDocumentMessage | null = null;
    private lastOpSummaryDetails: IOpSummaryDetails | null = null;
    private readonly runDeferred = new Deferred<void>();

    constructor(
        public readonly url: string,
        private readonly runtime: ContainerRuntime,
        private readonly configuration: ISummaryConfiguration,
        private readonly generateSummary: () => Promise<void>,
    ) {
        this.runtime.on("disconnected", () => {
            this.runDeferred.resolve();
        });
    }

    public async run(onBehalfOf: string): Promise<void> {
        debug(`Summarizing on behalf of ${onBehalfOf}`);

        if (!this.runtime.connected) {
            await new Promise((resolve) => this.runtime.once("connected", resolve));
        }

        if (this.runtime.summarizerClientId !== onBehalfOf) {
            return;
        }

        // start the timer after connecting to the document
        this.resetIdleTimer();

        this.runtime.on("batchEnd", (error: any, op: ISequencedDocumentMessage) => {
            if (error) {
                return;
            }

            this.clearIdleTimer();

            // Get the summary details for the given op
            this.lastOp = op;
            this.lastOpSummaryDetails = this.getOpSummaryDetails(op);

            if (this.lastOpSummaryDetails.shouldSummarize) {
                // Summarize immediately if requested
                // tslint:disable-next-line: no-floating-promises
                this.summarize(this.lastOpSummaryDetails.message);
            } else {
                // Otherwise detect when we idle to trigger the snapshot
                this.resetIdleTimer();
            }
        });

        return this.runDeferred.promise;
    }

    private async summarize(message: string) {
        try {
            // generateSummary could take some time
            // mark that we are currently summarizing to prevent concurrent summarizing
            this.summarizing = true;

            debug(`Summarizing: ${message}`);

            const summarySequenceNumber = this.lastOp ? this.lastOp.sequenceNumber : 1;

            await this.generateSummary();

            // On success note the time of the snapshot and op sequence number.
            // Skip on error to cause us to attempt the snapshot again.
            this.lastSummaryTime = Date.now();
            this.lastSummarySeqNumber = summarySequenceNumber;

        } catch (ex) {
            debug(`Summarize error ${this.runtime.id}`, ex);

        } finally {
            this.summarizing = false;
        }
    }

    private getOpSummaryDetails(op: ISequencedDocumentMessage): IOpSummaryDetails {
        if (this.summarizing) {
            // We are currently summarizing. Don't summarize again.
            return {
                message: "",
                shouldSummarize: false,
            };
        } else if (op.type === MessageType.Save) {
            // Forced summary.
            return {
                message: `;${op.clientId}: ${op.contents}`,
                shouldSummarize: true,
            };
        } else {
            // Summarize if it has been above the max time between summaries.
            const timeSinceLastSummary = Date.now() - this.lastSummaryTime;
            const opCountSinceLastSummary = op.sequenceNumber - this.lastSummarySeqNumber;
            return {
                message: "",
                shouldSummarize: (timeSinceLastSummary > this.configuration.maxTime) ||
                    (opCountSinceLastSummary > this.configuration.maxOps),
            };
        }
    }

    private clearIdleTimer() {
        if (!this.idleTimer) {
            return;
        }
        clearTimeout(this.idleTimer);
        this.idleTimer = null;
    }

    private resetIdleTimer() {
        this.clearIdleTimer();

        this.idleTimer = setTimeout(
            () => {
                debug("Summarizing due to being idle");
                // tslint:disable-next-line: no-floating-promises
                this.summarize("idle");
            },
            this.configuration.idleTime);
    }
}
