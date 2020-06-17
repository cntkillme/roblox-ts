import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformArrayBindingPattern } from "TSTransformer/nodes/binding/transformArrayBindingPattern";
import { transformVariable } from "TSTransformer/nodes/statements/transformVariableStatement";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { objectAccessor } from "TSTransformer/util/binding/objectAccessor";

export function transformObjectBindingPattern(
	state: TransformState,
	bindingPattern: ts.ObjectBindingPattern,
	parentId: lua.AnyIdentifier,
) {
	const hasSpread = bindingPattern.elements[bindingPattern.elements.length - 1].dotDotDotToken !== undefined;
	const spreadKeys = new Array<lua.Expression>();
	for (const element of bindingPattern.elements) {
		const name = element.name;
		if (element.dotDotDotToken) {
			assert(ts.isIdentifier(name));

			const { expression: resultId, statements } = transformVariable(state, name, lua.map());
			state.prereqList(statements);

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
										expression: resultId,
										index: keyId,
									}),
									right: valueId,
								}),
							),
						}),
					),
				}),
			);
		} else {
			const prop = element.propertyName;
			if (ts.isIdentifier(name)) {
				const value = objectAccessor(state, parentId, hasSpread, spreadKeys, name, prop);
				const { expression: id, statements } = transformVariable(state, name, value);
				state.prereqList(statements);
				if (element.initializer) {
					state.prereq(transformInitializer(state, id, element.initializer));
				}
			} else {
				const value = objectAccessor(state, parentId, hasSpread, spreadKeys, name, prop);
				const id = state.pushToVar(value);
				if (element.initializer) {
					state.prereq(transformInitializer(state, id, element.initializer));
				}
				if (ts.isArrayBindingPattern(name)) {
					transformArrayBindingPattern(state, name, id);
				} else {
					transformObjectBindingPattern(state, name, id);
				}
			}
		}
	}
}
