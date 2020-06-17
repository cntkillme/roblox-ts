import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { transformObjectBindingPattern } from "TSTransformer/nodes/binding/transformObjectBindingPattern";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformVariable } from "TSTransformer/nodes/statements/transformVariableStatement";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { getAccessorForBindingType } from "TSTransformer/util/binding/getAccessorForBindingType";

export function transformArrayBindingPattern(
	state: TransformState,
	bindingPattern: ts.ArrayBindingPattern,
	parentId: lua.AnyIdentifier,
	index = 0,
) {
	const idStack = new Array<lua.AnyIdentifier>();
	const accessType = state.getType(bindingPattern);
	const accessor = getAccessorForBindingType(state, accessType);
	for (const element of bindingPattern.elements) {
		if (ts.isOmittedExpression(element)) {
			accessor(state, parentId, lua.number(index), idStack, true, false);
		} else if (element.dotDotDotToken) {
			const name = element.name;
			if (ts.isIdentifier(name)) {
				const id = transformIdentifierDefined(state, name);
				state.prereq(
					lua.create(lua.SyntaxKind.VariableDeclaration, {
						left: id,
						right: lua.array(),
					}),
				);

				// state.prereq(
				// 	lua.create(lua.SyntaxKind.NumericForStatement, {
				// 		id: loopId,
				// 		start: lua.number(index + 1),
				// 		end: lua.unary("#", parentId),
				// 		step: undefined,
				// 		statements: lua.list.make(
				// 			lua.create(lua.SyntaxKind.Assignment, {
				// 				left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
				// 					expression: id,
				// 					index: loopId,
				// 				}),
				// 				right: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
				// 					expression: parentId,
				// 					index: loopId,
				// 				}),
				// 			}),
				// 		),
				// 	}),
				// );

				const storeId = lua.tempId();
				state.prereq(
					lua.create(lua.SyntaxKind.VariableDeclaration, {
						left: storeId,
						right: idStack[idStack.length - 1],
					}),
				);

				idStack.push(storeId);

				const { expression: value, statements: valuePrereqs } = state.capture(() =>
					accessor(state, parentId, lua.number(index), idStack, false, true),
				);

				const loopId = state.pushToVar(lua.number(0));

				const whileStatements = lua.list.make<lua.Statement>();
				lua.list.pushList(whileStatements, valuePrereqs);

				// storeId = accessor
				lua.list.push(
					whileStatements,
					lua.create(lua.SyntaxKind.Assignment, {
						left: storeId,
						right: value,
					}),
				);

				// if storeId == nil then break end
				lua.list.push(
					whileStatements,
					lua.create(lua.SyntaxKind.IfStatement, {
						condition: lua.binary(storeId, "==", lua.nil()),
						elseBody: lua.list.make(),
						statements: lua.list.make(lua.create(lua.SyntaxKind.BreakStatement, {})),
					}),
				);

				// loopId = loopId + 1
				lua.list.push(
					whileStatements,
					lua.create(lua.SyntaxKind.Assignment, {
						left: loopId,
						right: lua.binary(loopId, "+", lua.number(1)),
					}),
				);

				// var[loopId] = storeId
				lua.list.push(
					whileStatements,
					lua.create(lua.SyntaxKind.Assignment, {
						left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
							expression: id,
							index: loopId,
						}),
						right: storeId,
					}),
				);

				state.prereq(
					lua.create(lua.SyntaxKind.WhileStatement, {
						condition: lua.bool(true),
						statements: whileStatements,
					}),
				);
			} else if (ts.isArrayBindingPattern(name)) {
				transformArrayBindingPattern(state, name, parentId, index);
			} else {
				state.addDiagnostic(diagnostics.noSpreadDestructuringObjectInArray(element));
			}
		} else {
			const name = element.name;
			const value = accessor(state, parentId, lua.number(index), idStack, false, false);
			if (ts.isIdentifier(name)) {
				const { expression: id, statements } = transformVariable(state, name, value);
				state.prereqList(statements);
				if (element.initializer) {
					state.prereq(transformInitializer(state, id, element.initializer));
				}
			} else {
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
		index++;
	}
}
