import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformArrayBindingLiteral } from "TSTransformer/nodes/binding/transformArrayBindingLiteral";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import { getSubType } from "TSTransformer/util/binding/getSubType";
import { objectAccessor } from "TSTransformer/util/binding/objectAccessor";
import { skipDownwards } from "TSTransformer/util/traversal";

export function transformObjectBindingLiteral(
	state: TransformState,
	bindingLiteral: ts.ObjectLiteralExpression,
	parentId: lua.AnyIdentifier,
	accessType: ts.Type | ReadonlyArray<ts.Type>,
) {
	const hasSpread = ts.isSpreadAssignment(bindingLiteral.properties[bindingLiteral.properties.length - 1]);
	const spreadKeys = new Array<lua.Expression>();
	for (const property of bindingLiteral.properties) {
		if (ts.isShorthandPropertyAssignment(property)) {
			const name = property.name;
			const value = objectAccessor(state, parentId, hasSpread, spreadKeys, name, name);
			const id = transformWritableExpression(state, name, property.objectAssignmentInitializer !== undefined);
			state.prereq(lua.create(lua.SyntaxKind.Assignment, { left: id, right: value }));
			if (property.objectAssignmentInitializer) {
				state.prereq(transformInitializer(state, id, property.objectAssignmentInitializer));
			}
		} else if (ts.isSpreadAssignment(property)) {
			const name = property.expression;
			assert(ts.isIdentifier(name));

			const tempId = state.pushToVar(lua.map());
			const knownKeysId = state.pushToVar(lua.set(spreadKeys));
			const keyId = lua.tempId();
			const valueId = lua.tempId();
			state.prereq(
				lua.create(lua.SyntaxKind.ForStatement, {
					ids: lua.list.make(keyId, valueId),
					expression: lua.create(lua.SyntaxKind.CallExpression, {
						expression: lua.globals.pairs,
						args: lua.list.make(parentId),
					}),
					statements: lua.list.make(
						lua.create(lua.SyntaxKind.IfStatement, {
							condition: lua.unary(
								"not",
								lua.create(lua.SyntaxKind.ComputedIndexExpression, {
									expression: knownKeysId,
									index: keyId,
								}),
							),
							elseBody: lua.list.make(),
							statements: lua.list.make(
								lua.create(lua.SyntaxKind.Assignment, {
									left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
										expression: tempId,
										index: keyId,
									}),
									right: valueId,
								}),
							),
						}),
					),
				}),
			);

			const id = transformWritableExpression(state, name, false);
			state.prereq(lua.create(lua.SyntaxKind.Assignment, { left: id, right: tempId }));
		} else if (ts.isPropertyAssignment(property)) {
			const name = property.name;
			let init: ts.Expression | ts.ObjectLiteralElementLike = property.initializer;
			let initializer: ts.Expression | undefined;
			if (ts.isBinaryExpression(property.initializer)) {
				initializer = skipDownwards(property.initializer.right);
				init = skipDownwards(property.initializer.left);
			}

			const value = objectAccessor(state, parentId, hasSpread, spreadKeys, name, name);
			if (ts.isIdentifier(init) || ts.isElementAccessExpression(init) || ts.isPropertyAccessExpression(init)) {
				const id = transformWritableExpression(state, init, initializer !== undefined);
				state.prereq(lua.create(lua.SyntaxKind.Assignment, { left: id, right: value }));
				if (initializer) {
					state.prereq(transformInitializer(state, id, initializer));
				}
			} else if (ts.isArrayLiteralExpression(init)) {
				const id = state.pushToVar(value);
				if (initializer) {
					state.prereq(transformInitializer(state, id, initializer));
				}
				assert(ts.isIdentifier(name));
				transformArrayBindingLiteral(state, init, id, getSubType(state, accessType, name.text));
			} else if (ts.isObjectLiteralExpression(init)) {
				const id = state.pushToVar(value);
				if (initializer) {
					state.prereq(transformInitializer(state, id, initializer));
				}
				assert(ts.isIdentifier(name));
				transformObjectBindingLiteral(state, init, id, getSubType(state, accessType, name.text));
			} else {
				assert(false);
			}
		} else {
			assert(false);
		}
	}
}
