/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Context } from "@fluidframework/build-tools";
import { detectVersionScheme, fromInternalScheme } from "@fluid-tools/version-tools";
import * as semver from "semver";
import { ReleaseGroup } from "../releaseGroups";

/**
 * Creates a branch with changes for a release group bump.
 * @param context -
 * @param releaseGroup -
 * @param newVersion -
 * @returns
 */
export async function createBranchForBump(
    context: Context,
    releaseGroup: ReleaseGroup,
    newVersion: string,
): Promise<string> {
    const bumpBranch = `bump_${releaseGroup.toLowerCase()}_${newVersion}_${Date.now()}`;
    await context.createBranch(bumpBranch);
    return bumpBranch;
}

export function releaseBranchName(releaseGroup: ReleaseGroup, version: string): string {
    const scheme = detectVersionScheme(version);
    const branchVersion = scheme === "internal" ? fromInternalScheme(version)[1].version : version;
    const releaseBranchVersion =
        scheme === "virtualPatch"
            ? branchVersion
            : `${semver.major(branchVersion)}.${semver.minor(branchVersion)}`;
    const branchName = releaseGroup === "client" ? "v2int" : releaseGroup;
    const releaseBranch = `release/${branchName}/${releaseBranchVersion}`;
    return releaseBranch;
}
