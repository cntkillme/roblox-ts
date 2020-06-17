import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";

export const objectAccessor = (
	state: TransformState,
	parentId: lua.AnyIdentifier,
	hasSpread: boolean,
	spreadKeys: Array<lua.Expression>,
	node: ts.Node,
	name: ts.Node = node,
): lua.Expression => {
	if (ts.isIdentifier(name)) {
		if (hasSpread) {
			spreadKeys.push(lua.string(name.text));
		}
		return lua.create(lua.SyntaxKind.PropertyAccessExpression, {
			expression: parentId,
			name: name.text,
		});
	} else if (ts.isComputedPropertyName(name)) {
		let index = addOneIfArrayType(state, state.getType(name), transformExpression(state, name.expression));
		if (hasSpread) {
			index = state.pushToVar(index);
			spreadKeys.push(index);
		}
		return lua.create(lua.SyntaxKind.ComputedIndexExpression, {
			expression: parentId,
			index,
		});
	} else if (ts.isNumericLiteral(name) || ts.isStringLiteral(name)) {
		let index = transformExpression(state, name);
		if (hasSpread) {
			index = state.pushToVar(index);
			spreadKeys.push(index);
		}
		return lua.create(lua.SyntaxKind.ComputedIndexExpression, {
			expression: parentId,
			index,
		});
	}
	assert(false);
};
