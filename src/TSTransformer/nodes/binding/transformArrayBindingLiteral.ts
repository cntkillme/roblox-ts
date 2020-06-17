import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformObjectBindingLiteral } from "TSTransformer/nodes/binding/transformObjectBindingLiteral";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import { getAccessorForBindingType } from "TSTransformer/util/binding/getAccessorForBindingType";
import { getSubType } from "TSTransformer/util/binding/getSubType";
import { skipDownwards } from "TSTransformer/util/traversal";
import { isArrayType } from "TSTransformer/util/types";

export function transformArrayBindingLiteral(
	state: TransformState,
	bindingLiteral: ts.ArrayLiteralExpression,
	parentId: lua.AnyIdentifier,
	accessType: ts.Type | ReadonlyArray<ts.Type>,
	index = 0,
) {
	const idStack = new Array<lua.Identifier>();
	const accessor = getAccessorForBindingType(state, accessType);
	for (let element of bindingLiteral.elements) {
		if (ts.isOmittedExpression(element)) {
			accessor(state, parentId, lua.number(index), idStack, true, false);
		} else if (ts.isSpreadElement(element)) {
			if (!ts.isArray(accessType) && !isArrayType(state, accessType)) {
				state.addDiagnostic(diagnostics.noNonArraySpreadDestructuring(element));
				return;
			}

			const name = element.expression;
			if (ts.isIdentifier(name)) {
				const tempId = state.pushToVar(lua.array());
				const loopId = lua.tempId();
				state.prereq(
					lua.create(lua.SyntaxKind.NumericForStatement, {
						id: loopId,
						start: lua.number(index + 1),
						end: lua.unary("#", parentId),
						step: undefined,
						statements: lua.list.make(
							lua.create(lua.SyntaxKind.Assignment, {
								left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
									expression: tempId,
									index: loopId,
								}),
								right: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
									expression: parentId,
									index: loopId,
								}),
							}),
						),
					}),
				);
				const id = transformWritableExpression(state, name, false);
				state.prereq(lua.create(lua.SyntaxKind.Assignment, { left: id, right: tempId }));
			} else if (ts.isArrayLiteralExpression(name)) {
				transformArrayBindingLiteral(state, name, parentId, accessType, index);
			} else {
				state.addDiagnostic(diagnostics.noSpreadDestructuringObjectInArray(element));
			}
		} else {
			let initializer: ts.Expression | undefined;
			if (ts.isBinaryExpression(element)) {
				initializer = skipDownwards(element.right);
				element = skipDownwards(element.left);
			}

			const value = accessor(state, parentId, lua.number(index), idStack, false, false);
			if (
				ts.isIdentifier(element) ||
				ts.isElementAccessExpression(element) ||
				ts.isPropertyAccessExpression(element)
			) {
				const id = transformWritableExpression(state, element, initializer !== undefined);
				state.prereq(lua.create(lua.SyntaxKind.Assignment, { left: id, right: value }));
				if (initializer) {
					state.prereq(transformInitializer(state, id, initializer));
				}
			} else if (ts.isArrayLiteralExpression(element)) {
				const id = state.pushToVar(value);
				if (initializer) {
					state.prereq(transformInitializer(state, id, initializer));
				}
				transformArrayBindingLiteral(state, element, id, getSubType(state, accessType, index));
			} else if (ts.isObjectLiteralExpression(element)) {
				const id = state.pushToVar(value);
				if (initializer) {
					state.prereq(transformInitializer(state, id, initializer));
				}
				transformObjectBindingLiteral(state, element, id, getSubType(state, accessType, index));
			} else {
				assert(false);
			}
		}
		index++;
	}
}
