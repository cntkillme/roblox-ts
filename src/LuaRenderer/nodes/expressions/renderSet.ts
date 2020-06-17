import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { isValidLuaIdentifier } from "LuaRenderer/util/isValidLuaIdentifier";

export function renderSet(state: RenderState, node: lua.Set) {
	if (!node.members.head) {
		return "{}";
	}

	let result = "{\n";
	state.block(() => {
		lua.list.forEach(node.members, member => {
			if (lua.isStringLiteral(member) && isValidLuaIdentifier(member.value)) {
				result += state.line(`${member.value} = true,`);
			} else {
				result += state.line(`[${render(state, member)}] = true,`);
			}
		});
	});
	result += state.indented("}");
	return result;
}
