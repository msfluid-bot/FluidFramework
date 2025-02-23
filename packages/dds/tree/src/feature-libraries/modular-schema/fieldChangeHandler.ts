/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKindIdentifier, Delta, FieldKey, Value, TaggedChange, RevisionTag } from "../../core";
import { Brand, fail, Invariant, JsonCompatibleReadOnly } from "../../util";
import { ChangesetLocalId, CrossFieldManager } from "./crossFieldQueries";

/**
 * Functionality provided by a field kind which will be composed with other `FieldChangeHandler`s to
 * implement a unified ChangeFamily supporting documents with multiple field kinds.
 * @alpha
 */
export interface FieldChangeHandler<
	TChangeset,
	TEditor extends FieldEditor<TChangeset> = FieldEditor<TChangeset>,
> {
	_typeCheck?: Invariant<TChangeset>;
	rebaser: FieldChangeRebaser<TChangeset>;
	encoder: FieldChangeEncoder<TChangeset>;
	editor: TEditor;
	intoDelta(
		change: TChangeset,
		deltaFromChild: ToDelta,
		reviver: NodeReviver,
	): Delta.FieldChanges;
}

/**
 * @alpha
 */
export interface FieldChangeRebaser<TChangeset> {
	/**
	 * Compose a collection of changesets into a single one.
	 * Every child included in the composed change must be the result of a call to `composeChild`,
	 * and should be tagged with the revision of its parent change.
	 * Children which were the result of an earlier call to `composeChild` should be tagged with
	 * undefined revision if later passed as an argument to `composeChild`.
	 * See {@link ChangeRebaser} for more details.
	 */
	compose(
		changes: TaggedChange<TChangeset>[],
		composeChild: NodeChangeComposer,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
	): TChangeset;

	/**
	 * Amend `composedChange` with respect to new data in `crossFieldManager`.
	 */
	amendCompose(
		composedChange: TChangeset,
		composeChild: NodeChangeComposer,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
	): TChangeset;

	/**
	 * @returns the inverse of `changes`.
	 * See {@link ChangeRebaser} for details.
	 */
	invert(
		change: TaggedChange<TChangeset>,
		invertChild: NodeChangeInverter,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
	): TChangeset;

	/**
	 * Amend `invertedChange` with respect to new data in `crossFieldManager`.
	 */
	amendInvert(
		invertedChange: TChangeset,
		originalRevision: RevisionTag | undefined,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
	): TChangeset;

	/**
	 * Rebase `change` over `over`.
	 * See {@link ChangeRebaser} for details.
	 */
	rebase(
		change: TChangeset,
		over: TaggedChange<TChangeset>,
		rebaseChild: NodeChangeRebaser,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
	): TChangeset;

	/**
	 * Amend `rebasedChange` with respect to new data in `crossFieldManager`.
	 */
	amendRebase(
		rebasedChange: TChangeset,
		over: TaggedChange<TChangeset>,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
	): TChangeset;
}

/**
 * Helper for creating a {@link FieldChangeRebaser} which does not need access to revision tags.
 * This should only be used for fields where the child nodes cannot be edited.
 */
export function referenceFreeFieldChangeRebaser<TChangeset>(data: {
	compose: (changes: TChangeset[]) => TChangeset;
	invert: (change: TChangeset) => TChangeset;
	rebase: (change: TChangeset, over: TChangeset) => TChangeset;
}): FieldChangeRebaser<TChangeset> {
	return isolatedFieldChangeRebaser({
		compose: (changes, _composeChild, _genId) => data.compose(changes.map((c) => c.change)),
		invert: (change, _invertChild, _genId) => data.invert(change.change),
		rebase: (change, over, _rebaseChild, _genId) => data.rebase(change, over.change),
	});
}

export function isolatedFieldChangeRebaser<TChangeset>(data: {
	compose: FieldChangeRebaser<TChangeset>["compose"];
	invert: FieldChangeRebaser<TChangeset>["invert"];
	rebase: FieldChangeRebaser<TChangeset>["rebase"];
}): FieldChangeRebaser<TChangeset> {
	return {
		...data,
		amendCompose: () => fail("Not implemented"),
		amendInvert: () => fail("Not implemented"),
		amendRebase: () => fail("Not implemented"),
	};
}

/**
 * @alpha
 */
export interface FieldChangeEncoder<TChangeset> {
	/**
	 * Encodes `change` into a JSON compatible object.
	 */
	encodeForJson(
		formatVersion: number,
		change: TChangeset,
		encodeChild: NodeChangeEncoder,
	): JsonCompatibleReadOnly;

	/**
	 * Decodes `change` from a JSON compatible object.
	 */
	decodeJson(
		formatVersion: number,
		change: JsonCompatibleReadOnly,
		decodeChild: NodeChangeDecoder,
	): TChangeset;
}

/**
 * @alpha
 */
export interface FieldEditor<TChangeset> {
	/**
	 * Creates a changeset which represents the given `change` to the child at `childIndex` of this editor's field.
	 */
	buildChildChange(childIndex: number, change: NodeChangeset): TChangeset;
}

/**
 * The `index` represents the index of the child node in the input context.
 * The `index` should be `undefined` iff the child node does not exist in the input context (e.g., an inserted node).
 * Returns `undefined` iff the child changes amount to nothing.
 * @alpha
 */
export type ToDelta = (
	child: NodeChangeset,
	index: number | undefined,
) => Delta.NodeChanges | undefined;

/**
 * @alpha
 */
export type NodeReviver = (
	revision: RevisionTag,
	index: number,
	count: number,
) => Delta.ProtoNode[];

/**
 * @alpha
 */
export type NodeChangeInverter = (change: NodeChangeset) => NodeChangeset;

/**
 * @alpha
 */
export type NodeChangeRebaser = (change: NodeChangeset, baseChange: NodeChangeset) => NodeChangeset;

/**
 * @alpha
 */
export type NodeChangeComposer = (changes: TaggedChange<NodeChangeset>[]) => NodeChangeset;

/**
 * @alpha
 */
export type NodeChangeEncoder = (change: NodeChangeset) => JsonCompatibleReadOnly;

/**
 * @alpha
 */
export type NodeChangeDecoder = (change: JsonCompatibleReadOnly) => NodeChangeset;

/**
 * @alpha
 */
export type IdAllocator = () => ChangesetLocalId;

/**
 * Changeset for a subtree rooted at a specific node.
 * @alpha
 */
export interface NodeChangeset {
	fieldChanges?: FieldChangeMap;
	valueChange?: ValueChange;
}

/**
 * @alpha
 */
export type ValueChange =
	| {
			/**
			 * The revision in which this change occurred.
			 * Undefined when it can be inferred from context.
			 */
			revision?: RevisionTag;

			/**
			 * Can be left unset to represent the value being cleared.
			 */
			value?: Value;
	  }
	| {
			/**
			 * The revision in which this change occurred.
			 * Undefined when it can be inferred from context.
			 */
			revision?: RevisionTag;

			/**
			 * The tag of the change that overwrote the value being restored.
			 *
			 * Undefined when the operation is the product of a tag-less change being inverted.
			 * It is invalid to try convert such an operation to a delta.
			 */
			revert: RevisionTag | undefined;
	  };

/**
 * @alpha
 */
export interface ModularChangeset {
	/**
	 * The numerically highest `ChangesetLocalId` used in this changeset.
	 * If undefined then this changeset contains no IDs.
	 */
	maxId?: ChangesetLocalId;
	changes: FieldChangeMap;
}

/**
 * @alpha
 */
export type FieldChangeMap = Map<FieldKey, FieldChange>;

/**
 * @alpha
 */
export interface FieldChange {
	fieldKind: FieldKindIdentifier;

	/**
	 * If defined, `change` is part of the specified revision.
	 * Undefined in the following cases:
	 * A) A revision is specified on an ancestor of this `FieldChange`, in which case `change` is part of that revision.
	 * B) `change` is composed of multiple revisions.
	 * C) `change` is part of an anonymous revision.
	 */
	revision?: RevisionTag;
	change: FieldChangeset;
}

/**
 * @alpha
 */
export type FieldChangeset = Brand<unknown, "FieldChangeset">;
