/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return */

import { assert } from "chai";
import {
    PrepReleaseMachine,
    PrepReleaseMachineActions,
    PrepReleaseMachineStates,
    ReleaseMachine,
    ReleaseMachineActions,
    ReleaseMachineStates,
} from "../src/machines";
import { difference } from "../src/lib/sets";

describe("ReleaseMachine", () => {
    const machine = ReleaseMachine;
    const machineStates = new Set(machine.states());
    const machineActions = new Set(machine.list_actions());

    it("all machine states are known", () => {
        const knownStates = new Set([...ReleaseMachineStates.keys()]);
        const diff = difference(machineStates, knownStates);

        assert.equal(diff.size, 0, `Unknown states: ${[...diff].join(", ")}`);
    });

    it("all known states are machine states", () => {
        const knownStates = new Set([...ReleaseMachineStates.keys()]);
        const diff = difference(knownStates, machineStates);

        assert.equal(diff.size, 0, `States that have no machine state: ${[...diff].join(", ")}`);
    });

    it("all machine actions are known", () => {
        const knownActions = new Set([...ReleaseMachineActions.keys()]);
        const diff = difference(machineActions, knownActions);

        assert.equal(diff.size, 0, `Unknown actions: ${[...diff].join(", ")}`);
    });

    it("all known actions are machine actions", () => {
        const knownActions = new Set([...ReleaseMachineActions.keys()]);
        const diff = difference(knownActions, machineActions);

        assert.equal(diff.size, 0, `Actions that have no machine action: ${[...diff].join(", ")}`);
    });
});

describe("PrepReleaseMachine", () => {
    const machine = PrepReleaseMachine;
    const machineStates = new Set(machine.states());
    const machineActions = new Set(machine.list_actions());

    it("all machine states are known", () => {
        const knownStates = new Set([...PrepReleaseMachineStates.keys()]);
        const diff = difference(machineStates, knownStates);

        assert.equal(diff.size, 0, `Unknown states: ${[...diff].join(", ")}`);
    });

    it("all known states are machine states", () => {
        const knownStates = new Set([...PrepReleaseMachineStates.keys()]);
        const diff = difference(knownStates, machineStates);

        assert.equal(diff.size, 0, `States that have no machine state: ${[...diff].join(", ")}`);
    });

    it("all machine actions are known", () => {
        const knownActions = new Set([...PrepReleaseMachineActions.keys()]);
        const diff = difference(machineActions, knownActions);

        assert.equal(diff.size, 0, `Unknown actions: ${[...diff].join(", ")}`);
    });

    it("all known actions are machine actions", () => {
        const knownActions = new Set([...PrepReleaseMachineActions.keys()]);
        const diff = difference(knownActions, machineActions);

        assert.equal(diff.size, 0, `Actions that have no machine action: ${[...diff].join(", ")}`);
    });
});
