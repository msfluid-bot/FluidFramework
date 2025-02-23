/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ITaggedTelemetryPropertyType } from "@fluidframework/common-definitions";
import { LazyPromise, stringToBuffer } from "@fluidframework/common-utils";
import { AttachState, ContainerErrorType } from "@fluidframework/container-definitions";
import { FluidObject, IFluidHandleContext } from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { BlobCacheStorageService } from "@fluidframework/driver-utils";
import { GCDataBuilder } from "@fluidframework/garbage-collector";
import {
	IBlob,
	ISnapshotTree,
	ISummaryBlob,
	SummaryType,
} from "@fluidframework/protocol-definitions";
import {
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
	IFluidDataStoreRegistry,
	IGarbageCollectionData,
	IGarbageCollectionDetailsBase,
	SummarizeInternalFn,
	CreateChildSummarizerNodeFn,
	CreateSummarizerNodeSource,
	channelsTreeName,
} from "@fluidframework/runtime-definitions";
import {
	createRootSummarizerNodeWithGC,
	IRootSummarizerNodeWithGC,
	packagePathToTelemetryProperty,
} from "@fluidframework/runtime-utils";
import {
	isFluidError,
	MockLogger,
	TelemetryDataTag,
	TelemetryNullLogger,
} from "@fluidframework/telemetry-utils";
import {
	MockFluidDataStoreRuntime,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils";

import { DataStoreMessageType, FluidObjectHandle } from "@fluidframework/datastore";
import {
	LocalDetachedFluidDataStoreContext,
	LocalFluidDataStoreContext,
	RemoteFluidDataStoreContext,
} from "../dataStoreContext";
import { ContainerRuntime } from "../containerRuntime";
import {
	dataStoreAttributesBlobName,
	ReadFluidDataStoreAttributes,
	WriteFluidDataStoreAttributes,
	summarizerClientType,
} from "../summary";

describe("Data Store Context Tests", () => {
	const dataStoreId = "Test1";
	const emptyGCData: IGarbageCollectionData = { gcNodes: {} };
	let createSummarizerNodeFn: CreateChildSummarizerNodeFn;

	describe("LocalFluidDataStoreContext", () => {
		let localDataStoreContext: LocalFluidDataStoreContext;
		let storage: IDocumentStorageService;
		let scope: FluidObject;
		const makeLocallyVisibleFn = () => {};
		let containerRuntime: ContainerRuntime;
		let summarizerNode: IRootSummarizerNodeWithGC;

		function createContainerRuntime(
			logger = new TelemetryNullLogger(),
			clientDetails = {},
			submitDataStoreOp = (id: string, contents: any, localOpMetadata: unknown) => {},
		): ContainerRuntime {
			const factory: IFluidDataStoreFactory = {
				type: "store-type",
				get IFluidDataStoreFactory() {
					return factory;
				},
				instantiateDataStore: async (context: IFluidDataStoreContext) =>
					new MockFluidDataStoreRuntime(),
			};
			const registry: IFluidDataStoreRegistry = {
				get IFluidDataStoreRegistry() {
					return registry;
				},
				get: async (pkg) => (pkg === "BOGUS" ? undefined : factory),
			};
			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			return {
				IFluidDataStoreRegistry: registry,
				on: (event, listener) => {},
				logger,
				clientDetails,
				submitDataStoreOp,
			} as ContainerRuntime;
		}

		beforeEach(async () => {
			summarizerNode = createRootSummarizerNodeWithGC(
				new TelemetryNullLogger(),
				(() => undefined) as unknown as SummarizeInternalFn,
				0,
				0,
			);
			summarizerNode.startSummary(0, new TelemetryNullLogger());

			createSummarizerNodeFn = (
				summarizeInternal: SummarizeInternalFn,
				getGCDataFn: () => Promise<IGarbageCollectionData>,
			) =>
				summarizerNode.createChild(
					summarizeInternal,
					dataStoreId,
					{ type: CreateSummarizerNodeSource.Local },
					// DDS will not create failure summaries
					{ throwOnFailure: true },
					getGCDataFn,
				);
			containerRuntime = createContainerRuntime();
		});

		describe("Initialization", () => {
			it("rejects ids with forward slashes", async () => {
				const invalidId = "beforeSlash/afterSlash";
				const codeBlock = () =>
					new LocalFluidDataStoreContext({
						id: invalidId,
						pkg: ["TestDataStore1"],
						runtime: containerRuntime,
						storage,
						scope,
						createSummarizerNodeFn,
						makeLocallyVisibleFn,
						snapshotTree: undefined,
						isRootDataStore: true,
					});

				assert.throws(codeBlock, (e: Error) =>
					validateAssertionError(e, "Data store ID contains slash"),
				);
			});

			it("Errors thrown during realize are wrapped as DataProcessingError", async () => {
				const fullPackageName = ["BOGUS1", "BOGUS2"];
				localDataStoreContext = new LocalFluidDataStoreContext({
					id: dataStoreId,
					pkg: fullPackageName, // This will cause an error when calling `realizeCore`
					runtime: containerRuntime,
					storage,
					scope,
					createSummarizerNodeFn,
					makeLocallyVisibleFn,
					snapshotTree: undefined,
					isRootDataStore: true,
				});

				try {
					await localDataStoreContext.realize();
					assert.fail("realize should have thrown an error due to empty pkg array");
				} catch (e) {
					assert(isFluidError(e), "Expected a valid Fluid Error to be thrown");
					assert.equal(
						e.errorType,
						ContainerErrorType.dataProcessingError,
						"Error should be a DataProcessingError",
					);
					const props = e.getTelemetryProperties();
					assert.strictEqual(
						(props.fullPackageName as ITaggedTelemetryPropertyType)?.value,
						packagePathToTelemetryProperty(fullPackageName)?.value,
						"The error should have the full package name in its telemetry properties",
					);
					assert.equal(
						(props.failedPkgPath as ITaggedTelemetryPropertyType)?.value,
						"BOGUS1",
						"The error should have the failed package path in its telemetry properties",
					);
					assert.equal(
						(props.fluidDataStoreId as ITaggedTelemetryPropertyType)?.value,
						"Test1",
						"The error should have the fluidDataStoreId in its telemetry properties",
					);
				}
			});

			it("can initialize correctly and generate attributes", async () => {
				localDataStoreContext = new LocalFluidDataStoreContext({
					id: dataStoreId,
					pkg: ["TestDataStore1"],
					runtime: containerRuntime,
					storage,
					scope,
					createSummarizerNodeFn,
					makeLocallyVisibleFn,
					snapshotTree: undefined,
					isRootDataStore: true,
				});

				await localDataStoreContext.realize();
				const attachMessage = localDataStoreContext.generateAttachMessage();

				const attributesEntry = attachMessage.snapshot.entries.find(
					(e) => e.path === dataStoreAttributesBlobName,
				);
				assert(
					attributesEntry !== undefined,
					"There is no attributes blob in the summary tree",
				);
				// Assume that it is in write format, will see errors if not.
				const contents = JSON.parse(
					(attributesEntry.value as IBlob).contents,
				) as WriteFluidDataStoreAttributes;
				const dataStoreAttributes: WriteFluidDataStoreAttributes = {
					pkg: JSON.stringify(["TestDataStore1"]),
					summaryFormatVersion: 2,
					isRootDataStore: true,
				};

				assert.strictEqual(
					contents.pkg,
					dataStoreAttributes.pkg,
					"Local DataStore package does not match.",
				);
				assert.strictEqual(
					contents.summaryFormatVersion,
					dataStoreAttributes.summaryFormatVersion,
					"Local DataStore snapshot version does not match.",
				);
				assert.strictEqual(
					contents.isRootDataStore,
					dataStoreAttributes.isRootDataStore,
					"Local DataStore root state does not match",
				);
				assert.strictEqual(
					attachMessage.type,
					"TestDataStore1",
					"Attach message type does not match.",
				);
			});

			it("should generate exception when incorrectly created with array of packages", async () => {
				let exception = false;
				localDataStoreContext = new LocalFluidDataStoreContext({
					id: dataStoreId,
					pkg: ["TestComp", "SubComp"],
					runtime: containerRuntime,
					storage,
					scope,
					createSummarizerNodeFn,
					makeLocallyVisibleFn,
					snapshotTree: undefined,
					isRootDataStore: false,
				});

				await localDataStoreContext.realize().catch((error) => {
					exception = true;
				});
				assert.strictEqual(exception, true, "Exception did not occur.");
			});

			it("can initialize and generate attributes when correctly created with array of packages", async () => {
				const registryWithSubRegistries: { [key: string]: any } = {};
				registryWithSubRegistries.IFluidDataStoreFactory = registryWithSubRegistries;
				registryWithSubRegistries.IFluidDataStoreRegistry = registryWithSubRegistries;
				registryWithSubRegistries.get = async (pkg) =>
					Promise.resolve(registryWithSubRegistries);
				registryWithSubRegistries.instantiateDataStore = async (
					context: IFluidDataStoreContext,
				) => new MockFluidDataStoreRuntime();

				// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
				containerRuntime = {
					IFluidDataStoreRegistry: registryWithSubRegistries,
					on: (event, listener) => {},
					clientDetails: {},
				} as ContainerRuntime;
				localDataStoreContext = new LocalFluidDataStoreContext({
					id: dataStoreId,
					pkg: ["TestComp", "SubComp"],
					runtime: containerRuntime,
					storage,
					scope,
					createSummarizerNodeFn,
					makeLocallyVisibleFn,
					snapshotTree: undefined,
					isRootDataStore: false,
				});

				await localDataStoreContext.realize();

				const attachMessage = localDataStoreContext.generateAttachMessage();
				const attributesEntry = attachMessage.snapshot.entries.find(
					(e) => e.path === dataStoreAttributesBlobName,
				);
				assert(
					attributesEntry !== undefined,
					"There is no attributes blob in the summary tree",
				);
				const contents = JSON.parse(
					(attributesEntry.value as IBlob).contents,
				) as WriteFluidDataStoreAttributes;
				const dataStoreAttributes: WriteFluidDataStoreAttributes = {
					pkg: JSON.stringify(["TestComp", "SubComp"]),
					summaryFormatVersion: 2,
					isRootDataStore: false,
				};

				assert.strictEqual(
					contents.pkg,
					dataStoreAttributes.pkg,
					"Local DataStore package does not match.",
				);
				assert.strictEqual(
					contents.summaryFormatVersion,
					dataStoreAttributes.summaryFormatVersion,
					"Local DataStore snapshot version does not match.",
				);
				assert.strictEqual(
					contents.isRootDataStore,
					dataStoreAttributes.isRootDataStore,
					"Local DataStore root state does not match",
				);
				assert.strictEqual(
					attachMessage.type,
					"SubComp",
					"Attach message type does not match.",
				);
			});

			it("can correctly initialize root context", async () => {
				localDataStoreContext = new LocalFluidDataStoreContext({
					id: dataStoreId,
					pkg: ["TestDataStore1"],
					runtime: containerRuntime,
					storage,
					scope,
					createSummarizerNodeFn,
					makeLocallyVisibleFn,
					snapshotTree: undefined,
					isRootDataStore: true,
				});

				const isRootNode = await localDataStoreContext.isRoot();
				assert.strictEqual(isRootNode, true, "The data store should be root.");
			});

			it("can correctly initialize non-root context", async () => {
				localDataStoreContext = new LocalFluidDataStoreContext({
					id: dataStoreId,
					pkg: ["TestDataStore1"],
					runtime: containerRuntime,
					storage,
					scope,
					createSummarizerNodeFn,
					makeLocallyVisibleFn,
					snapshotTree: undefined,
					isRootDataStore: false,
				});

				const isRootNode = await localDataStoreContext.isRoot();
				assert.strictEqual(isRootNode, false, "The data store should not be root.");
			});
		});

		describe("Local data stores in summarizer client", () => {
			let mockLogger: MockLogger;
			const packageName = ["TestDataStore1"];
			beforeEach(async () => {
				// Change the container runtime's logger to MockLogger and its type to be a summarizer client.
				mockLogger = new MockLogger();
				const clientDetails = {
					capabilities: {
						interactive: false,
					},
					type: summarizerClientType,
				};
				containerRuntime = createContainerRuntime(mockLogger, clientDetails);
			});

			it("logs when local data store is created in summarizer", async () => {
				localDataStoreContext = new LocalFluidDataStoreContext({
					id: dataStoreId,
					pkg: packageName,
					runtime: containerRuntime,
					storage,
					scope,
					createSummarizerNodeFn,
					makeLocallyVisibleFn,
					snapshotTree: undefined,
					isRootDataStore: false,
				});

				const expectedEvents = [
					{
						eventName: "FluidDataStoreContext:DataStoreCreatedInSummarizer",
						packageName: packagePathToTelemetryProperty(packageName),
						fluidDataStoreId: {
							value: dataStoreId,
							tag: TelemetryDataTag.CodeArtifact,
						},
					},
				];
				mockLogger.assertMatch(
					expectedEvents,
					"data store create event not generated as expected",
				);
			});

			it("logs when local data store sends op in summarizer", async () => {
				localDataStoreContext = new LocalFluidDataStoreContext({
					id: dataStoreId,
					pkg: packageName,
					runtime: containerRuntime,
					storage,
					scope,
					createSummarizerNodeFn,
					makeLocallyVisibleFn,
					snapshotTree: undefined,
					isRootDataStore: false,
				});
				await localDataStoreContext.realize();

				localDataStoreContext.submitMessage(
					DataStoreMessageType.ChannelOp,
					"summarizer message",
					{},
				);

				const expectedEvents = [
					{
						eventName: "FluidDataStoreContext:DataStoreMessageSubmittedInSummarizer",
						packageName: packagePathToTelemetryProperty(packageName),
						fluidDataStoreId: {
							value: dataStoreId,
							tag: TelemetryDataTag.CodeArtifact,
						},
						type: DataStoreMessageType.ChannelOp,
					},
				];
				mockLogger.assertMatch(
					expectedEvents,
					"data store message submitted event not generated as expected",
				);
			});

			it("logs maximum of 10 local summarizer events per data store", async () => {
				localDataStoreContext = new LocalFluidDataStoreContext({
					id: dataStoreId,
					pkg: packageName,
					runtime: containerRuntime,
					storage,
					scope,
					createSummarizerNodeFn,
					makeLocallyVisibleFn,
					snapshotTree: undefined,
					isRootDataStore: false,
				});
				await localDataStoreContext.realize();

				let eventCount = 0;
				for (let i = 0; i < 15; i++) {
					localDataStoreContext.submitMessage(
						DataStoreMessageType.ChannelOp,
						`summarizer message ${i}`,
						{},
					);
				}
				for (const event of mockLogger.events) {
					if (
						event.eventName ===
							"FluidDataStoreContext:DataStoreMessageSubmittedInSummarizer" ||
						event.eventName === "FluidDataStoreContext:DataStoreCreatedInSummarizer"
					) {
						eventCount++;
					}
				}
				assert.strictEqual(eventCount, 10, "There should be only 10 events per data store");
			});
		});

		describe("Garbage Collection", () => {
			it("can generate correct GC data", async () => {
				localDataStoreContext = new LocalFluidDataStoreContext({
					id: dataStoreId,
					pkg: ["TestDataStore1"],
					runtime: containerRuntime,
					storage,
					scope,
					createSummarizerNodeFn,
					makeLocallyVisibleFn,
					snapshotTree: undefined,
					isRootDataStore: true,
				});

				const gcData = await localDataStoreContext.getGCData();
				assert.deepStrictEqual(
					gcData,
					emptyGCData,
					"GC data from getGCData should be empty.",
				);
			});

			it("can successfully update referenced state", () => {
				localDataStoreContext = new LocalFluidDataStoreContext({
					id: dataStoreId,
					pkg: ["TestComp", "SubComp"],
					runtime: containerRuntime,
					storage,
					scope,
					createSummarizerNodeFn,
					makeLocallyVisibleFn,
					snapshotTree: undefined,
					isRootDataStore: false,
				});

				// Get the summarizer node for this data store which tracks its referenced state.
				const dataStoreSummarizerNode = summarizerNode.getChild(dataStoreId);
				assert.strictEqual(
					dataStoreSummarizerNode?.isReferenced(),
					true,
					"Data store should be referenced by default",
				);

				// Update the used routes to not include route to the data store.
				localDataStoreContext.updateUsedRoutes([]);
				assert.strictEqual(
					dataStoreSummarizerNode?.isReferenced(),
					false,
					"Data store should now be unreferenced",
				);

				// Add the data store's route (empty string) to its used routes.
				localDataStoreContext.updateUsedRoutes([""]);
				assert.strictEqual(
					dataStoreSummarizerNode?.isReferenced(),
					true,
					"Data store should now be referenced",
				);
			});

			it("can tombstone a local datastore", async () => {
				localDataStoreContext = new LocalFluidDataStoreContext({
					id: dataStoreId,
					pkg: ["TestComp", "SubComp"],
					runtime: containerRuntime,
					storage,
					scope,
					createSummarizerNodeFn,
					makeLocallyVisibleFn,
					snapshotTree: undefined,
					isRootDataStore: false,
				});

				localDataStoreContext.setTombstone(true);
				assert(localDataStoreContext.tombstoned, `Local data store should be tombstoned!`);
				localDataStoreContext.setTombstone(false);
				assert(
					!localDataStoreContext.tombstoned,
					`Local data store should not be tombstoned!`,
				);
			});
		});
	});

	describe("RemoteDataStoreContext", () => {
		let remoteDataStoreContext: RemoteFluidDataStoreContext;
		let dataStoreAttributes: ReadFluidDataStoreAttributes;
		const storage: Partial<IDocumentStorageService> = {};
		let scope: FluidObject;
		let summarizerNode: IRootSummarizerNodeWithGC;
		let containerRuntime: ContainerRuntime;

		beforeEach(async () => {
			const factory: { [key: string]: any } = {};
			factory.IFluidDataStoreFactory = factory;
			factory.instantiateDataStore = (context: IFluidDataStoreContext) =>
				new MockFluidDataStoreRuntime();
			const registry: { [key: string]: any } = {};
			registry.IFluidDataStoreRegistry = registry;
			registry.get = async (pkg) => Promise.resolve(factory);

			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			containerRuntime = {
				IFluidDataStoreRegistry: registry,
				on: (event, listener) => {},
				clientDetails: {},
			} as ContainerRuntime;
		});

		describe("Initialization - can correctly initialize and generate attributes", () => {
			beforeEach(() => {
				summarizerNode = createRootSummarizerNodeWithGC(
					new TelemetryNullLogger(),
					(() => undefined) as unknown as SummarizeInternalFn,
					0,
					0,
				);
				summarizerNode.startSummary(0, new TelemetryNullLogger());

				createSummarizerNodeFn = (
					summarizeInternal: SummarizeInternalFn,
					getGCDataFn: () => Promise<IGarbageCollectionData>,
				) =>
					summarizerNode.createChild(
						summarizeInternal,
						dataStoreId,
						{ type: CreateSummarizerNodeSource.FromSummary },
						// Disable GC for initialization tests.
						{ gcDisabled: true },
						getGCDataFn,
					);
			});
			const pkgName = "TestDataStore1";

			/**
			 * Runs the initialization and generate datastore attributes tests with the given write-mode preferences
			 * and expectations.
			 * This runs the same test with various summary write and read preferences. Specifically each call of this
			 * function will run the test 4 times, one for each possible summary format we could be reading from.
			 * @param expected - the expected datastore attributes to be generated given the write preference
			 */
			function testGenerateAttributes(expected: WriteFluidDataStoreAttributes) {
				/**
				 * This function is called for each possible base snapshot format version. We want to cover all
				 * summary format read/write combinations. We only write in latest or -1 version, but we can
				 * need to be able to read old summary format versions forever.
				 * @param hasIsolatedChannels - whether we expect to read a snapshot tree with isolated channels or not
				 * @param attributes - datastore attributes that are in the base snapshot we load from
				 */
				async function testGenerateAttributesCore(
					attributes: ReadFluidDataStoreAttributes,
				) {
					const buffer = stringToBuffer(JSON.stringify(attributes), "utf8");
					const blobCache = new Map<string, ArrayBufferLike>([
						["fluidDataStoreAttributes", buffer],
					]);
					const snapshotTree: ISnapshotTree = {
						blobs: { [dataStoreAttributesBlobName]: "fluidDataStoreAttributes" },
						trees: {},
					};
					// If we are expecting to read isolated channels as intended by the test, then make sure
					// it exists on the snapshot. Otherwise, make sure it doesn't to most closely resemble
					// real loading use cases.
					snapshotTree.trees[channelsTreeName] = {
						blobs: {},
						trees: {},
					};

					remoteDataStoreContext = new RemoteFluidDataStoreContext({
						id: dataStoreId,
						snapshotTree,
						runtime: containerRuntime,
						storage: new BlobCacheStorageService(
							storage as IDocumentStorageService,
							blobCache,
						),
						scope,
						createSummarizerNodeFn,
					});

					const isRootNode = await remoteDataStoreContext.isRoot();
					assert.strictEqual(isRootNode, true, "The data store should be root.");

					const summarizeResult = await remoteDataStoreContext.summarize(
						true /* fullTree */,
					);
					assert(
						summarizeResult.summary.type === SummaryType.Tree,
						"summarize should always return a tree when fullTree is true",
					);
					const blob = summarizeResult.summary.tree[
						dataStoreAttributesBlobName
					] as ISummaryBlob;

					const contents = JSON.parse(
						blob.content as string,
					) as WriteFluidDataStoreAttributes;

					// Validate that generated attributes are as expected.
					assert.deepStrictEqual(
						contents,
						expected,
						"Unexpected datastore attributes written",
					);
				}

				it("can read from latest with isolated channels", async () =>
					testGenerateAttributesCore({
						pkg: JSON.stringify([pkgName]),
						summaryFormatVersion: 2,
						isRootDataStore: true,
					}));
			}

			it("rejects ids with forward slashes", async () => {
				const invalidId = "beforeSlash/afterSlash";
				const codeBlock = () =>
					new RemoteFluidDataStoreContext({
						id: invalidId,
						pkg: ["TestDataStore1"],
						runtime: containerRuntime,
						storage: storage as IDocumentStorageService,
						scope,
						createSummarizerNodeFn,
						snapshotTree: undefined,
					});

				assert.throws(codeBlock, (e: Error) =>
					validateAssertionError(e, "Data store ID contains slash"),
				);
			});
			describe("writing with isolated channels enabled", () =>
				testGenerateAttributes({
					pkg: JSON.stringify([pkgName]),
					summaryFormatVersion: 2,
					isRootDataStore: true,
				}));
		});

		describe("Garbage Collection", () => {
			// The base GC details of the root summarizer node. The child base GC details from this is passed on to the
			// child summarizer node during its creation.
			let rootBaseGCDetails: IGarbageCollectionDetailsBase;
			const getRootBaseGCDetails = async (): Promise<IGarbageCollectionDetailsBase> =>
				rootBaseGCDetails;

			/**
			 * Given the GC data of a data store, build the GC data of the root (parent) node.
			 */
			function buildRootGCData(dataStoreGCData: IGarbageCollectionData, id: string) {
				const builder = new GCDataBuilder();
				builder.prefixAndAddNodes(id, dataStoreGCData.gcNodes);
				return builder.getGCData();
			}

			beforeEach(() => {
				summarizerNode = createRootSummarizerNodeWithGC(
					new TelemetryNullLogger(),
					(() => undefined) as unknown as SummarizeInternalFn,
					0,
					0,
					undefined,
					undefined,
					getRootBaseGCDetails,
				);
				summarizerNode.startSummary(0, new TelemetryNullLogger());

				createSummarizerNodeFn = (
					summarizeInternal: SummarizeInternalFn,
					getGCDataFn: () => Promise<IGarbageCollectionData>,
				) =>
					summarizerNode.createChild(
						summarizeInternal,
						dataStoreId,
						{ type: CreateSummarizerNodeSource.FromSummary },
						undefined,
						getGCDataFn,
					);
			});

			it("can generate GC data without base GC details in initial summary", async () => {
				dataStoreAttributes = {
					pkg: "TestDataStore1",
					summaryFormatVersion: undefined,
				};
				const buffer = stringToBuffer(JSON.stringify(dataStoreAttributes), "utf8");
				const blobCache = new Map<string, ArrayBufferLike>([
					["fluidDataStoreAttributes", buffer],
				]);
				const snapshotTree: ISnapshotTree = {
					blobs: {
						[dataStoreAttributesBlobName]: "fluidDataStoreAttributes",
					},
					trees: {},
				};

				remoteDataStoreContext = new RemoteFluidDataStoreContext({
					id: dataStoreId,
					snapshotTree,
					runtime: containerRuntime,
					storage: new BlobCacheStorageService(
						storage as IDocumentStorageService,
						blobCache,
					),
					scope,
					createSummarizerNodeFn,
				});

				const gcData = await remoteDataStoreContext.getGCData();
				assert.deepStrictEqual(
					gcData,
					emptyGCData,
					"GC data from getGCData should be empty.",
				);
			});

			it("can generate GC data with GC details in initial summary", async () => {
				dataStoreAttributes = {
					pkg: "TestDataStore1",
					summaryFormatVersion: undefined,
				};
				const attributesBuffer = stringToBuffer(
					JSON.stringify(dataStoreAttributes),
					"utf8",
				);
				const blobCache = new Map<string, ArrayBufferLike>([
					["fluidDataStoreAttributes", attributesBuffer],
				]);
				const snapshotTree: ISnapshotTree = {
					blobs: {
						[dataStoreAttributesBlobName]: "fluidDataStoreAttributes",
					},
					trees: {},
				};

				// The base GC data of the data store.
				const dataStoreGCData: IGarbageCollectionData = {
					gcNodes: {
						"/": ["/dds1", "/dds2"],
						"/dds1": ["/dds2", "/"],
					},
				};
				// Set the root base GC details to include the child node's base GC data.
				rootBaseGCDetails = {
					usedRoutes: [],
					gcData: buildRootGCData(dataStoreGCData, dataStoreId),
				};

				remoteDataStoreContext = new RemoteFluidDataStoreContext({
					id: dataStoreId,
					snapshotTree,
					runtime: containerRuntime,
					storage: new BlobCacheStorageService(
						storage as IDocumentStorageService,
						blobCache,
					),
					scope,
					createSummarizerNodeFn,
				});

				const gcData = await remoteDataStoreContext.getGCData();
				assert.deepStrictEqual(
					gcData,
					dataStoreGCData,
					"GC data from getGCData is incorrect.",
				);
			});

			it("should not reuse summary data when used state changed since last summary", async () => {
				dataStoreAttributes = {
					pkg: "TestDataStore1",
					summaryFormatVersion: undefined,
				};
				const attributesBuffer = stringToBuffer(
					JSON.stringify(dataStoreAttributes),
					"utf8",
				);
				const blobCache = new Map<string, ArrayBufferLike>([
					["fluidDataStoreAttributes", attributesBuffer],
				]);
				const snapshotTree: ISnapshotTree = {
					id: "dummy",
					blobs: {
						[dataStoreAttributesBlobName]: "fluidDataStoreAttributes",
					},
					trees: {},
				};

				// The base GC data of the data store.
				const dataStoreGCData: IGarbageCollectionData = {
					gcNodes: {
						"/": [],
					},
				};
				// Set the root base GC details to include the child node's base GC data.
				rootBaseGCDetails = {
					usedRoutes: [`/${dataStoreId}`],
					gcData: buildRootGCData(dataStoreGCData, dataStoreId),
				};

				remoteDataStoreContext = new RemoteFluidDataStoreContext({
					id: dataStoreId,
					snapshotTree,
					runtime: containerRuntime,
					storage: new BlobCacheStorageService(
						storage as IDocumentStorageService,
						blobCache,
					),
					scope,
					createSummarizerNodeFn,
				});

				// Since GC is enabled, GC must run before summarize. Get the GC data and update used routes to
				// emulate the GC process.
				const gcData = await remoteDataStoreContext.getGCData();
				assert.deepStrictEqual(
					gcData,
					dataStoreGCData,
					"GC data from getGCData should be empty.",
				);
				// Update used routes to the same as in initial GC details. This will ensure that the used state
				// matches the initial used state.
				remoteDataStoreContext.updateUsedRoutes([""]);

				// The data in the store has not changed since last summary and the reference used routes (from initial
				// used routes) and current used routes (default) are both empty. So, summarize should return a handle.
				let summarizeResult = await remoteDataStoreContext.summarize(false /* fullTree */);
				assert(
					summarizeResult.summary.type === SummaryType.Handle,
					"summarize should return a handle since nothing changed",
				);

				// Update the used routes of the data store to a different value than current.
				remoteDataStoreContext.updateUsedRoutes([]);

				// Since the used state has changed, it should generate a full summary tree.
				summarizeResult = await remoteDataStoreContext.summarize(false /* fullTree */);
				assert(
					summarizeResult.summary.type === SummaryType.Tree,
					"summarize should return a tree since used state changed",
				);
			});

			function updateReferencedStateTest() {
				const buffer = stringToBuffer(JSON.stringify(dataStoreAttributes), "utf8");
				const blobCache = new Map<string, ArrayBufferLike>([
					["fluidDataStoreAttributes", buffer],
				]);
				const snapshotTree: ISnapshotTree = {
					id: "dummy",
					blobs: { [".component"]: "fluidDataStoreAttributes" },
					trees: {},
				};

				remoteDataStoreContext = new RemoteFluidDataStoreContext({
					id: dataStoreId,
					snapshotTree,
					runtime: containerRuntime,
					storage: new BlobCacheStorageService(
						storage as IDocumentStorageService,
						blobCache,
					),
					scope,
					createSummarizerNodeFn,
				});

				// Get the summarizer node for this data store which tracks its referenced state.
				const dataStoreSummarizerNode = summarizerNode.getChild(dataStoreId);
				assert.strictEqual(
					dataStoreSummarizerNode?.isReferenced(),
					true,
					"Data store should be referenced by default",
				);

				// Update the used routes to not include route to the data store.
				remoteDataStoreContext.updateUsedRoutes([]);
				assert.strictEqual(
					dataStoreSummarizerNode?.isReferenced(),
					false,
					"Data store should now be unreferenced",
				);

				// Add the data store's route (empty string) to its used routes.
				remoteDataStoreContext.updateUsedRoutes([""]);
				assert.strictEqual(
					dataStoreSummarizerNode?.isReferenced(),
					true,
					"Data store should now be referenced",
				);
			}

			it("can successfully update referenced state from format version 0", () => {
				dataStoreAttributes = {
					pkg: "TestDataStore1",
				};
				updateReferencedStateTest();
			});

			it("can successfully update referenced state from format version 1", () => {
				dataStoreAttributes = {
					pkg: '["TestDataStore1"]',
					snapshotFormatVersion: "0.1",
				};
				updateReferencedStateTest();
			});

			it("can successfully update referenced state from format version 2", () => {
				dataStoreAttributes = {
					pkg: '["TestDataStore1"]',
					summaryFormatVersion: 2,
				};
				updateReferencedStateTest();
			});

			it("can successfully tombstone a remote datastore", async () => {
				dataStoreAttributes = {
					pkg: JSON.stringify(["TestDataStore1"]),
					isRootDataStore: false,
				};
				const buffer = stringToBuffer(JSON.stringify(dataStoreAttributes), "utf8");
				const blobCache = new Map<string, ArrayBufferLike>([
					["fluidDataStoreAttributes", buffer],
				]);
				const snapshotTree: ISnapshotTree = {
					id: "dummy",
					blobs: { [".component"]: "fluidDataStoreAttributes" },
					trees: {},
				};

				remoteDataStoreContext = new RemoteFluidDataStoreContext({
					id: dataStoreId,
					snapshotTree,
					runtime: containerRuntime,
					storage: new BlobCacheStorageService(
						storage as IDocumentStorageService,
						blobCache,
					),
					scope,
					createSummarizerNodeFn,
				});

				remoteDataStoreContext.setTombstone(true);
				assert(remoteDataStoreContext.tombstoned, `Local data store should be tombstoned!`);
				remoteDataStoreContext.setTombstone(false);
				assert(
					!remoteDataStoreContext.tombstoned,
					`Local data store should not be tombstoned!`,
				);
			});
		});
	});

	describe("LocalDetachedFluidDataStoreContext", () => {
		let localDataStoreContext: LocalDetachedFluidDataStoreContext;
		let storage: IDocumentStorageService;
		let scope: FluidObject;
		let factory: IFluidDataStoreFactory;
		const makeLocallyVisibleFn = () => {};
		let containerRuntime: ContainerRuntime;
		let provideDsRuntimeWithFailingEntrypoint = false;

		beforeEach(async () => {
			const summarizerNode: IRootSummarizerNodeWithGC = createRootSummarizerNodeWithGC(
				new TelemetryNullLogger(),
				(() => undefined) as unknown as SummarizeInternalFn,
				0,
				0,
			);
			summarizerNode.startSummary(0, new TelemetryNullLogger());

			createSummarizerNodeFn = (
				summarizeInternal: SummarizeInternalFn,
				getGCDataFn: () => Promise<IGarbageCollectionData>,
			) =>
				summarizerNode.createChild(
					summarizeInternal,
					dataStoreId,
					{ type: CreateSummarizerNodeSource.Local },
					// DDS will not create failure summaries
					{ throwOnFailure: true },
					getGCDataFn,
				);

			const failingEntryPoint = new FluidObjectHandle<FluidObject>(
				new LazyPromise(async () => {
					throw new Error("Simulating failure when initializing EntryPoint");
				}),
				"",
				undefined as unknown as IFluidHandleContext,
			);

			factory = {
				type: "store-type",
				get IFluidDataStoreFactory() {
					return factory;
				},
				instantiateDataStore: async (context: IFluidDataStoreContext, existing: boolean) =>
					provideDsRuntimeWithFailingEntrypoint
						? new MockFluidDataStoreRuntime({ entryPoint: failingEntryPoint })
						: new MockFluidDataStoreRuntime(),
			};
			const registry: IFluidDataStoreRegistry = {
				get IFluidDataStoreRegistry() {
					return registry;
				},
				get: async (pkg) => (pkg === factory.type ? factory : undefined),
			};
			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			containerRuntime = {
				IFluidDataStoreRegistry: registry,
				on: (event, listener) => {},
				logger: new TelemetryNullLogger(),
				clientDetails: {},
			} as ContainerRuntime;
		});

		describe("Initialization", () => {
			it("rejects ids with forward slashes", async () => {
				const invalidId = "beforeSlash/afterSlash";
				const codeBlock = () =>
					new LocalDetachedFluidDataStoreContext({
						id: invalidId,
						pkg: [factory.type],
						runtime: containerRuntime,
						storage,
						scope,
						createSummarizerNodeFn,
						makeLocallyVisibleFn,
						snapshotTree: undefined,
						isRootDataStore: true,
					});

				assert.throws(codeBlock, (e: Error) =>
					validateAssertionError(e, "Data store ID contains slash"),
				);
			});

			describe("should error on attach if data store cannot be constructed/initialized", () => {
				// Tests in this suite should be scenarios that lead to a data store which cannot be constructed for
				// some reason.

				it("because of package type for data store not present in registry", async () => {
					let exceptionOccurred = false;
					localDataStoreContext = new LocalDetachedFluidDataStoreContext({
						id: dataStoreId,
						pkg: ["some-datastore-type-not-present-in-registry"],
						runtime: containerRuntime,
						storage,
						scope,
						createSummarizerNodeFn,
						makeLocallyVisibleFn,
						snapshotTree: undefined,
						isRootDataStore: false,
					});

					const dataStore = await factory.instantiateDataStore(
						localDataStoreContext,
						false,
					);
					await localDataStoreContext.attachRuntime(factory, dataStore).catch((error) => {
						assert.strictEqual(
							error.message,
							"Registry does not contain entry for the package",
							"Unexpected exception thrown",
						);
						exceptionOccurred = true;
					});
					assert.strictEqual(
						exceptionOccurred,
						true,
						"attachRuntime() call did not fail as expected.",
					);
					assert.strictEqual(localDataStoreContext.attachState, AttachState.Detached);
				});

				it("because of entryPoint that fails to initialize", async () => {
					let exceptionOccurred = false;
					provideDsRuntimeWithFailingEntrypoint = true;

					localDataStoreContext = new LocalDetachedFluidDataStoreContext({
						id: dataStoreId,
						pkg: [factory.type],
						runtime: containerRuntime,
						storage,
						scope,
						createSummarizerNodeFn,
						makeLocallyVisibleFn,
						snapshotTree: undefined,
						isRootDataStore: false,
					});

					const dataStore = await factory.instantiateDataStore(
						localDataStoreContext,
						false,
					);
					await localDataStoreContext.attachRuntime(factory, dataStore).catch((error) => {
						assert.strictEqual(
							error.message,
							"Simulating failure when initializing EntryPoint",
							"Unexpected exception thrown",
						);
						exceptionOccurred = true;
					});
					assert.strictEqual(
						exceptionOccurred,
						true,
						"attachRuntime() call did not fail as expected.",
					);
					assert.strictEqual(localDataStoreContext.attachState, AttachState.Detached);
				});
			});
		});
	});
});
